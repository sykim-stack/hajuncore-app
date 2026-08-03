// app/api/webhook/route.ts
// GitHub Push Webhook — 감지 및 기록만 (자동 수정/판단 없음)
// 역할: Push 이벤트 수신 → 변경 파일 목록 Supabase에 저장
// 판단은 사람(함장님)과 그록(PM)이 함

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';

// GitHub Webhook 서명 검증
async function verifySignature(body: string, signature: string): Promise<boolean> {
  if (!WEBHOOK_SECRET) return true; // 개발 환경 — secret 없으면 통과
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const hex = 'sha256=' + Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === signature;
}

// Core 침범 여부 감지 (판단 아님 — 패턴 매칭만)
function detectDrift(files: string[]): string[] {
  const alerts: string[] = [];

  const CORE_PATTERNS: Record<string, string[]> = {
    'CoreNull (클로3)':  ['corenull', 'houses', 'rooms', 'posts', 'seeds'],
    'CoreHub (클로4)':   ['corehub', 'hub_', 'opportunities', 'facts'],
    'CoreRing (클로5)':  ['corering', 'translations', 'dictionary', 'tb_trans'],
    'HajunAI (클로2)':  ['hajunai', 'hajun', 'knowledge', 'contexts'],
  };

  for (const file of files) {
    const matched: string[] = [];
    for (const [core, patterns] of Object.entries(CORE_PATTERNS)) {
      if (patterns.some(p => file.toLowerCase().includes(p))) {
        matched.push(core);
      }
    }
    // 2개 이상 Core 패턴이 하나의 파일에 → 잠재적 침범
    if (matched.length >= 2) {
      alerts.push(`⚠️ ${file} → ${matched.join(' + ')} 패턴 중복 감지`);
    }
  }

  return alerts;
}

export async function POST(req: Request) {
  const traceId = crypto.randomUUID();

  try {
    const body = await req.text();
    const signature = req.headers.get('x-hub-signature-256') || '';
    const event = req.headers.get('x-github-event') || '';

    // 서명 검증
    const valid = await verifySignature(body, signature);
    if (!valid) {
      return Response.json({ _error: '서명 불일치', traceId }, { status: 401 });
    }

    // push 이벤트만 처리
    if (event !== 'push') {
      return Response.json({ skipped: true, event, traceId });
    }

    const payload = JSON.parse(body);
    const repo    = payload.repository?.full_name || 'unknown';
    const branch  = payload.ref?.replace('refs/heads/', '') || 'unknown';
    const pusher  = payload.pusher?.name || 'unknown';
    const message = payload.head_commit?.message || '';
    const commits = payload.commits || [];

    // 변경 파일 목록 수집
    const changedFiles: string[] = [];
    for (const commit of commits) {
      changedFiles.push(...(commit.added    || []));
      changedFiles.push(...(commit.modified || []));
      changedFiles.push(...(commit.removed  || []));
    }
    const uniqueFiles = [...new Set(changedFiles)];

    // Drift 감지 (패턴 매칭만)
    const driftAlerts = detectDrift(uniqueFiles);

    // Supabase에 저장
    const logEntry = {
      repo,
      branch,
      pusher,
      commit_message: message,
      changed_files:  uniqueFiles,
      drift_alerts:   driftAlerts,
      event_type:     'push',
      raw_payload:    JSON.stringify(payload).slice(0, 5000),
      created_at:     new Date().toISOString(),
    };

    await fetch(`${SUPABASE_URL}/rest/v1/drift_logs`, {
      method: 'POST',
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization:  `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer:         'return=minimal',
      },
      body: JSON.stringify(logEntry),
    });

    console.log(`[webhook] ${repo}@${branch} by ${pusher} — ${uniqueFiles.length}개 파일, drift ${driftAlerts.length}개`);

    return Response.json({
      received:      true,
      repo,
      branch,
      pusher,
      files_changed: uniqueFiles.length,
      drift_alerts:  driftAlerts,
      traceId,
    });

  } catch (e) {
    return Response.json(
      { _error: e instanceof Error ? e.message : String(e), traceId },
      { status: 500 }
    );
  }
}

// GitHub Webhook ping 응답
export async function GET() {
  return Response.json({ status: 'webhook ready', traceId: crypto.randomUUID() });
}