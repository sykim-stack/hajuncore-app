// lib/hermesClient.ts
//
// HajunAI → Hermes Agent 실행 도구 연결 (MVP-0)
//
// 대상: 이 PC에서 실행 중인 `hermes serve` 백엔드 (기본 http://127.0.0.1:9119)
// 프로토콜: JSON-RPC 2.0 over WebSocket (protocol hermes-gateway-v1)
//           — Hermes Desktop 앱이 쓰는 것과 동일한 통로. 설정 변경 불필요.
//
// BRAINPOOL 계약: throw 금지 · _error 필드 반환 · 성패 모두 호출자가 판단한다.
// 런타임: Node 전용 (전역 WebSocket = Node 22+). Edge 런타임에서 import 하지 말 것.
//
// 확인된 흐름 (2026-11 실측):
//   ws://127.0.0.1:9119/api/ws?token=<세션토큰>  (연결 즉시 gateway.ready)
//   → session.create {source, profile, cwd} → {session_id, stored_session_id, ...}
//   → prompt.submit {session_id, text}
//   → event:message.start → message.delta / thinking.delta → message.complete
//     (message.complete.payload = { text, usage, status })
//   같은 session_id 로 다시 prompt.submit 하면 대화가 이어진다.

export const HERMES_BASE_URL = process.env.HERMES_BASE_URL || 'http://127.0.0.1:9119';

const DEFAULT_TIMEOUT_MS = 600_000;
const EVENT_LOG_MAX = 400;
const OPEN_TIMEOUT_MS = 15_000;

type Json = Record<string, unknown>;

export interface HermesHealth {
  reachable: boolean;
  base_url: string;
  version?: string;
  auth_required?: boolean;
  _error?: string;
}

export interface HermesRunInput {
  /** 하준아이가 넘기는 작업 지시 원문. */
  prompt: string;
  /** 있으면 그 세션에 이어서 보낸다 (작업 연속성). */
  session_id?: string;
  /** 작업 폴더. Hermes 가 이 경로의 AGENTS.md·메모리·스킬을 함께 읽는다. */
  cwd?: string;
  /** 세션 출처 표기. 기본 'gui'. */
  source?: string;
  /** 전체 대기 한도(ms). 기본 600000. */
  timeout_ms?: number;
}

export interface HermesRunResult {
  session_id?: string;
  stored_session_id?: string;
  /** 최종 답변 텍스트. */
  text?: string;
  /** 'complete' | 'cancelled' | 'failed' 등. */
  status?: string;
  /** 토큰·context 사용량 (message.complete.payload.usage). */
  usage?: Json;
  /** 흘러간 이벤트 라벨 로그 (message.delta:… 등, 최대 400개). */
  events?: string[];
  duration_ms?: number;
  _error?: string;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function wsUrl(base: string, token: string): string {
  const root = base.replace(/^http/i, 'ws').replace(/\/+$/, '');
  return `${root}/api/ws?token=${encodeURIComponent(token)}`;
}

/** 백엔드 루트 HTML에 심어진 로컬 세션 토큰을 읽는다. (HTTP 1회, 파일 접근 아님) */
export async function readSessionToken(): Promise<{ token?: string; _error?: string }> {
  try {
    const res = await fetch(HERMES_BASE_URL + '/', { cache: 'no-store' });
    const html = await res.text();
    const m = html.match(/__HERMES_SESSION_TOKEN__="([^"]+)"/);
    if (!m) {
      return {
        _error:
          'Hermes 세션 토큰을 찾지 못했습니다. hermes serve 가 실행 중인지, ' +
          '주소가 맞는지 확인하세요 (HERMES_BASE_URL).',
      };
    }
    return { token: m[1] };
  } catch (e) {
    return {
      _error: `Hermes 백엔드에 연결할 수 없습니다 (${HERMES_BASE_URL}): ${errMsg(e)}`,
    };
  }
}

/** 백엔드 생존 확인. 작업을 실행하지 않는다. */
export async function hermesHealth(): Promise<HermesHealth> {
  const out: HermesHealth = { reachable: false, base_url: HERMES_BASE_URL };
  try {
    const res = await fetch(HERMES_BASE_URL + '/api/health', { cache: 'no-store' });
    const j = (await res.json()) as Json;
    out.reachable = j?.ok === true;
    out.version = typeof j?.version === 'string' ? j.version : undefined;
    out.auth_required = j?.auth_required === true;
    return out;
  } catch (e) {
    out._error = `Hermes 백엔드 응답 없음 (${HERMES_BASE_URL}): ${errMsg(e)}`;
    return out;
  }
}

/**
 * 작업 지시를 Hermes 에게 넘기고 최종 답변까지 받는다.
 * session_id 를 주면 새 세션을 만들지 않고 그 대화를 이어간다.
 */
export async function hermesRun(input: HermesRunInput): Promise<HermesRunResult> {
  const prompt = (input.prompt || '').trim();
  if (!prompt) return { _error: 'prompt 가 비어 있습니다' };
  if (typeof WebSocket === 'undefined') {
    return { _error: '이 런타임에는 전역 WebSocket 이 없습니다 (Node 22+ 필요)' };
  }

  const startedAt = Date.now();
  const timeoutMs =
    typeof input.timeout_ms === 'number' && input.timeout_ms > 0
      ? input.timeout_ms
      : DEFAULT_TIMEOUT_MS;

  const tok = await readSessionToken();
  if (!tok.token) return { _error: tok._error };

  const events: string[] = [];
  let socket: WebSocket | undefined;
  let serial = 0;
  const rpcWaiters = new Map<string, (m: Json) => void>();
  const eventWaiters: { type: string; sessionId?: string; resolve: (p: Json) => void; done: boolean }[] =
    [];

  const waitEvent = (type: string, sessionId: string | undefined, ms: number) =>
    new Promise<Json>((resolve, reject) => {
      const w = { type, sessionId, resolve, done: false };
      eventWaiters.push(w);
      setTimeout(() => {
        if (!w.done) {
          w.done = true;
          reject(new Error(`이벤트 대기 시간 초과: ${type}`));
        }
      }, ms);
    });

  const rpc = (method: string, params: Json, ms: number) =>
    new Promise<Json>((resolve, reject) => {
      const id = String(++serial);
      const timer = setTimeout(() => {
        rpcWaiters.delete(id);
        reject(new Error(`RPC 응답 시간 초과: ${method}`));
      }, ms);
      rpcWaiters.set(id, (msg) => {
        clearTimeout(timer);
        if (msg.error) reject(new Error(`${method} → ${JSON.stringify(msg.error)}`));
        else resolve((msg.result ?? {}) as Json);
      });
      socket!.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });

  try {
    socket = new WebSocket(wsUrl(HERMES_BASE_URL, tok.token));

    socket.addEventListener('message', (ev: MessageEvent) => {
      let m: Json;
      try {
        m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)) as Json;
      } catch {
        return;
      }
      const params = (m.params ?? {}) as Json;
      const type = typeof params.type === 'string' ? (params.type as string) : '';
      if (m.method && type) {
        if (events.length < EVENT_LOG_MAX) events.push(`${m.method}:${type}`);
        for (const w of eventWaiters) {
          if (
            !w.done &&
            w.type === type &&
            (!w.sessionId || w.sessionId === params.session_id)
          ) {
            w.done = true;
            w.resolve(params);
          }
        }
        return;
      }
      if (m.id != null) {
        const key = String(m.id);
        const w = rpcWaiters.get(key);
        if (w) {
          rpcWaiters.delete(key);
          w(m);
        }
      }
    });

    await new Promise<void>((resolve, reject) => {
      socket!.addEventListener('open', () => resolve(), { once: true });
      socket!.addEventListener(
        'error',
        () => reject(new Error('WebSocket 연결 실패 (토큰 만료 또는 백엔드 재시작 가능)')),
        { once: true }
      );
      setTimeout(() => reject(new Error('WebSocket 연결 시간 초과')), OPEN_TIMEOUT_MS);
    });

    // 1) 세션 확보 — session_id 가 오면 새로 만들지 않는다.
    let sessionId = (input.session_id || '').trim();
    let storedSessionId: string | undefined;
    if (!sessionId) {
      const created = await rpc(
        'session.create',
        { source: input.source || 'gui', profile: '', cwd: input.cwd || process.cwd() },
        OPEN_TIMEOUT_MS
      );
      sessionId = typeof created.session_id === 'string' ? created.session_id : '';
      storedSessionId =
        typeof created.stored_session_id === 'string' ? created.stored_session_id : undefined;
      if (!sessionId) return { _error: 'session.create 가 session_id 를 주지 않았습니다' };
    }

    // 2) 작업 지시 전달
    await rpc('prompt.submit', { session_id: sessionId, text: prompt }, OPEN_TIMEOUT_MS);

    // 3) 최종 답변 대기
    const doneAt = waitEvent('message.complete', sessionId, timeoutMs);
    const finished = await doneAt;
    const payload = (finished.payload ?? {}) as Json;

    const result: HermesRunResult = {
      session_id: sessionId,
      text: typeof payload.text === 'string' ? payload.text : '',
      status: typeof payload.status === 'string' ? payload.status : 'complete',
      duration_ms: Date.now() - startedAt,
      events,
    };
    if (storedSessionId) result.stored_session_id = storedSessionId;
    if (payload.usage) result.usage = payload.usage as Json;
    return result;
  } catch (e) {
    return {
      session_id: input.session_id || undefined,
      events,
      duration_ms: Date.now() - startedAt,
      _error: errMsg(e),
    };
  } finally {
    try {
      socket?.close();
    } catch {
      /* 정리 실패는 결과를 덮지 않는다 */
    }
  }
}
