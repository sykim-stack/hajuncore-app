// app/api/docs/route.ts
// brainpool-os GitHub 문서를 fetch해서 반환
// GET /api/docs?file=Master_Prompt_v2.0
// GET /api/docs?file=clo2 | clo3
// GET /api/docs?agent=claude2 | clo3  → 해당 에이전트 기본 문서 일괄
// GET /api/docs?file=all

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
  'ADR_ACCESS_001':        'doc/adr/ADR-ACCESS-001.md',
  'clo2':                  'doc/contexts/clo2.md',
  'clo3':                  'doc/contexts/clo3.md',
  'CORENULL_ROADMAP':      'doc/status/CORENULL_ROADMAP.md',
  'DEV_CONTEXT_SUMMARY':   'doc/status/DEV_CONTEXT_SUMMARY.md',
  'DOC_INDEX':             'doc/DOC_INDEX.md',
};

// 에이전트별 기본 주입 문서
const AGENT_DOCS: Record<string, string[]> = {
  claude2: ['Master_Prompt_v2.0', 'Agents_Directive', 'clo2'],
  clo2:    ['Master_Prompt_v2.0', 'Agents_Directive', 'clo2'],
  clo3:    ['Master_Prompt_v2.0', 'Agents_Directive', 'clo3', 'CORENULL_ROADMAP', 'CoreNull_Seed_System'],
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const file  = searchParams.get('file') || 'Master_Prompt_v2.0';
  const agent = searchParams.get('agent'); // ?agent=clo3 → 해당 에이전트 기본 문서

  try {
    // ?agent=xxx → 에이전트 기본 문서 일괄 반환
    if (agent && AGENT_DOCS[agent]) {
      const results: Record<string, string> = {};
      for (const key of AGENT_DOCS[agent]) {
        const path = DOC_MAP[key];
        if (!path) continue;
        const res = await fetch(`${GITHUB_RAW_BASE}/${path}`, { cache: 'no-store' });
        results[key] = res.ok ? await res.text() : `[fetch 실패: ${res.status}]`;
      }
      return Response.json({
        agent,
        docs: results,
        fetched_at: new Date().toISOString(),
      });
    }

    // ?file=all → 전체 문서
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

    // ?file=xxx → 단일 문서
    const path = DOC_MAP[file];
    if (!path) {
      return Response.json({
        _error: `알 수 없는 문서: ${file}`,
        available: Object.keys(DOC_MAP),
      });
    }

    const res = await fetch(`${GITHUB_RAW_BASE}/${path}`, { cache: 'no-store' });
    if (!res.ok) {
      return Response.json({ _error: `GitHub fetch 실패: ${res.status}` });
    }

    const content = await res.text();
    return Response.json({
      file,
      path,
      content,
      fetched_at: new Date().toISOString(),
    });

  } catch (e) {
    return Response.json(
      { _error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
