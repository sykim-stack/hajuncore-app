// app/api/docs/route.ts
// brainpool-os GitHub 문서를 fetch해서 반환
// Claude가 직접 GitHub raw URL에 접근 못하는 문제 해결
// GET /api/docs?file=Master_Prompt_v2.0
// GET /api/docs?file=Agents_Directive
// GET /api/docs?file=all  → 전체 문서 (JSON)
// GET /api/docs?agent=claude2 → 필수 문서를 plain text로 반환

export const dynamic = 'force-dynamic';

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/sykim-stack/brainpool-os/main';

const DOC_MAP: Record<string, string> = {
  'Master_Prompt_v2.0':    'doc/directives/Master_Prompt_v2.0.md',
  'Agents_Directive':      'doc/directives/Agents_Directive.md',
  'CoreNull_Seed_System':  'doc/directives/CoreNull_Seed_System.md',
  'ARCHITECTURE_LINTER':   'doc/automation/ARCHITECTURE_LINTER.md',
  'WORKFLOW':              'doc/automation/WORKFLOW.md',
  'PM_GUARD':              'doc/automation/PM_GUARD.md',
  'ADR_001':               'doc/adr/ADR-001-Derived-Data-Layer.md',
  // --- 신규 추가된 문서들 ---
  'DEV_CONTEXT_SUMMARY':          'doc/status/DEV_CONTEXT_SUMMARY.md',
  'Identity_Platform_Architecture': 'doc/directives/Identity_Platform_Architecture_v1.0.md',
  'AI_Collaboration_Governance':    'doc/directives/AI_Collaboration_Governance.md',
  'HajunAI_Manual':                'doc/directives/BRAINPOOL_HajunAI_Manual.md',
  'Task_Identity_Connection':      'doc/directives/Task_Identity_Connection_v1.0.md'
};

// 클로드2(또는 HajunAI)가 세션 시작 시 받아야 할 필수 문서
const CLAUDE2_DOCS = [
  'Master_Prompt_v2.0',
  'Agents_Directive',
  'DEV_CONTEXT_SUMMARY',
  'AI_Collaboration_Governance'
];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const file  = searchParams.get('file') || 'Master_Prompt_v2.0';
  const agent = searchParams.get('agent');

  try {
    // === agent=claude2: 필수 문서를 plain text로 연결 ===
    if (agent === 'claude2') {
      const results: string[] = [];
      for (const key of CLAUDE2_DOCS) {
        const path = DOC_MAP[key];
        if (!path) continue;
        const res = await fetch(`${GITHUB_RAW_BASE}/${path}`, { cache: 'no-store' });
        const text = res.ok ? await res.text() : `[fetch 실패: ${res.status}]`;
        results.push(`=== ${key} ===\n${text}`);
      }
      return new Response(results.join('\n\n'), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    // === ?file=all → 모든 문서를 JSON으로 반환 (기존 유지) ===
    if (file === 'all') {
      const results: Record<string, string> = {};
      for (const [key, path] of Object.entries(DOC_MAP)) {
        const res = await fetch(`${GITHUB_RAW_BASE}/${path}`, { cache: 'no-store' });
        results[key] = res.ok ? await res.text() : `[fetch 실패: ${res.status}]`;
      }
      return Response.json({
        docs: results,
        fetched_at: new Date().toISOString(),
      });
    }

    // === 단일 문서 → plain text ===
    const path = DOC_MAP[file];
    if (!path) {
      return Response.json({
        _error: `알 수 없는 문서: ${file}`,
        available: Object.keys(DOC_MAP),
      }, { status: 404 });
    }

    const res = await fetch(`${GITHUB_RAW_BASE}/${path}`, { cache: 'no-store' });
    if (!res.ok) {
      return Response.json({ _error: `GitHub fetch 실패: ${res.status}` }, { status: 500 });
    }

    const content = await res.text();
    return new Response(content, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });

  } catch (e) {
    return Response.json(
      { _error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}