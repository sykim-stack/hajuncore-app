// app/api/docs/route.ts
// brainpool-os GitHub 문서를 fetch해서 반환
// Claude가 직접 GitHub raw URL에 접근 못하는 문제 해결
// GET /api/docs?file=Master_Prompt_v2.0
// GET /api/docs?file=Agents_Directive
// GET /api/docs?file=all  → 주요 문서 전체

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
  // Agent Context Contracts
  'clo2':                  'doc/contexts/clo2.md',
  'clo3':                  'doc/contexts/clo3.md',
  'clo4':                  'doc/contexts/clo4.md',
  'clo5':                  'doc/contexts/clo5.md',
  'pm':                    'doc/contexts/pm.md',
  'clo4':                  'doc/contexts/clo4.md',
  'clo5':                  'doc/contexts/clo5.md',
  'pm':                    'doc/contexts/pm.md',
};

// 클로2 기본 주입 문서 목록
const CLAUDE2_DOCS = ['Master_Prompt_v2.0', 'Agents_Directive', 'clo2'];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const file  = searchParams.get('file') || 'Master_Prompt_v2.0';
  const agent = searchParams.get('agent'); // ?agent=claude2 → 해당 에이전트 기본 문서

  try {
    // ?agent=claude2 → 클로2 기본 문서 일괄 반환
    if (agent === 'claude2') {
      const results: Record<string, string> = {};
      for (const key of CLAUDE2_DOCS) {
        const path = DOC_MAP[key];
        if (!path) continue;
        const res = await fetch(`${GITHUB_RAW_BASE}/${path}`, { cache: 'no-store' });
        results[key] = res.ok ? await res.text() : `[fetch 실패: ${res.status}]`;
      }
      return Response.json({
        agent: 'claude2',
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

    // ?file=Master_Prompt_v2.0 → 단일 문서
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