// app/api/webhook/route.ts
// GitHub push → drift_logs 기록
// BRAINPOOL: throw 금지, _error 필드, 판단은 사람+PM

import { createHmac, timingSafeEqual } from 'crypto';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';

/** Core 경계 침범·주의 패턴 (경로 휴리스틱 — 최종 판단 아님) */
const DRIFT_PATTERNS: { pattern: RegExp; alert: string }[] = [
  { pattern: /Master_Prompt/i, alert: 'Constitution(Master_Prompt) 변경 — Decision Owner 확인 필요' },
  { pattern: /doc\/directives\//i, alert: 'directives 변경 — 역할/원칙 Drift 가능' },
  { pattern: /doc\/adr\//i, alert: 'ADR 변경/추가' },
  { pattern: /corenull_/i, alert: 'CoreNull 스키마/접두사 관련 파일' },
  { pattern: /hajunai_/i, alert: 'HajunAI 스키마 관련 파일' },
  { pattern: /corehub/i, alert: 'CoreHub 관련 경로' },
  { pattern: /corering|tp_trans/i, alert: 'CoreRing/번역 관련 경로' },
  { pattern: /app\/api\/(houses|rooms|posts|yard|library)/i, alert: 'CoreNull API 경로 변경 가능' },
  { pattern: /app\/api\/hajun/i, alert: 'HajunAI API 변경' },
  { pattern: /contextPackage|context_package/i, alert: 'context_package / 에이전트 맥락 주입 변경' },
];

function verifySignature(payload: string, signatureHeader: string | null): boolean {
  if (!WEBHOOK_SECRET) {
    // 시크릿 미설정 시 개발 편의상 통과 — 운영에서는 반드시 설정
    console.warn('[webhook] GITHUB_WEBHOOK_SECRET 미설정 — signature 검증 스킵');
    return true;
  }
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');
  const received = signatureHeader.slice('sha256='.length);
  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(received, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function collectChangedFiles(body: Record<string, unknown>): string[] {
  const commits = (body.commits as Array<Record<string, unknown>>) || [];
  const set = new Set<string>();
  for (const c of commits) {
    for (const key of ['added', 'removed', 'modified'] as const) {
      const list = c[key];
      if (Array.isArray(list)) {
        for (const f of list) if (typeof f === 'string') set.add(f);
      }
    }
  }
  // head_commit fallback
  const head = body.head_commit as Record<string, unknown> | undefined;
  if (head) {
    for (const key of ['added', 'removed', 'modified'] as const) {
      const list = head[key];
      if (Array.isArray(list)) {
        for (const f of list) if (typeof f === 'string') set.add(f);
      }
    }
  }
  return [...set].slice(0, 200);
}

function detectDriftAlerts(files: string[]): string[] {
  const alerts = new Set<string>();
  for (const file of files) {
    for (const { pattern, alert } of DRIFT_PATTERNS) {
      if (pattern.test(file)) alerts.add(alert);
    }
  }
  return [...alerts];
}

async function insertDriftLog(row: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/drift_logs`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false as const, error: text.slice(0, 500) };
  }
  try {
    const data = JSON.parse(text);
    return { ok: true as const, data: Array.isArray(data) ? data[0] : data };
  } catch {
    return { ok: true as const, data: null };
  }
}

export async function GET() {
  return Response.json({
    ok: true,
    service: 'brainpool-github-webhook',
    accepts: 'POST GitHub push events',
    table: 'drift_logs',
  });
}

export async function POST(req: Request) {
  const traceId = 'wh-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256');
    const event = req.headers.get('x-github-event') || 'unknown';

    if (!verifySignature(rawBody, signature)) {
      return Response.json({ _error: 'invalid signature', traceId }, { status: 200 });
    }

    // ping
    if (event === 'ping') {
      return Response.json({ ok: true, event: 'ping', traceId });
    }

    if (event !== 'push') {
      return Response.json({ ok: true, skipped: true, event, traceId });
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return Response.json({ _error: 'invalid json', traceId }, { status: 200 });
    }

    const repo =
      (body.repository as { full_name?: string })?.full_name ||
      (body.repository as { name?: string })?.name ||
      'unknown';
    const ref = String(body.ref || '');
    const branch = ref.replace(/^refs\/heads\//, '') || 'unknown';
    const pusher =
      (body.pusher as { name?: string })?.name ||
      (body.sender as { login?: string })?.login ||
      'unknown';
    const after = String(body.after || '');
    const before = String(body.before || '');
    const compare = String(body.compare || '');
    const forced = Boolean(body.forced);

    const changed_files = collectChangedFiles(body);
    const drift_alerts = detectDriftAlerts(changed_files);

    const row = {
      repo,
      branch,
      pusher,
      before_sha: before || null,
      after_sha: after || null,
      compare_url: compare || null,
      forced,
      changed_files,
      drift_alerts,
      event,
      payload_summary: {
        commit_count: Array.isArray(body.commits) ? body.commits.length : 0,
        head_message: (body.head_commit as { message?: string })?.message?.slice(0, 200) || null,
      },
      created_at: new Date().toISOString(),
    };

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return Response.json({
        _error: 'SUPABASE env missing',
        dry_run: row,
        traceId,
      }, { status: 200 });
    }

    const inserted = await insertDriftLog(row);
    if (!inserted.ok) {
      return Response.json({
        _error: 'drift_logs insert failed',
        detail: inserted.error,
        traceId,
      }, { status: 200 });
    }

    return Response.json({
      ok: true,
      id: inserted.data?.id ?? null,
      repo,
      branch,
      changed_files_count: changed_files.length,
      drift_alerts,
      traceId,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ _error: msg, traceId }, { status: 500 });
  }
}
