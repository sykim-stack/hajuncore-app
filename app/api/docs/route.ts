// app/api/docs/route.ts
// brainpool-os GitHub 문서를 fetch해서 반환
// Claude가 직접 GitHub raw URL에 접근 못하는 문제 해결
// GET /api/docs?file=Master_Prompt_v2.0
// GET /api/docs?file=Agents_Directive
// GET /api/docs?file=all  → 주요 문서 전체
// GET /api/docs?agent=claude2|clo2|clo3|pm → 해당 에이전트 기본 문서 패키지
//
// [master 기준 이식 이력 - origin/main과 병합하지 않음]
// origin/main에 있던 PM 문서 조회 기능 중 clo2/clo3/pm 에이전트 패키지와
// 일부 문서키만 선택 이식. main의 context_package, 옛 /api/hajun 구조,
// CoreNull_Seed_System을 clo3에 포함하는 것 등은 가져오지 않음 —
// 오늘 AI CoreNull 전환에서 명시적으로 배제된 것들이라 그대로 제외.
// /api/hajun, app/hajun/**, ai_respond, 마당/방 구조는 이 작업과 무관 - 변경 없음.

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

  // pm/상태 문서 (main에서 확인된 경로 그대로 이식)
  'ADR_ACCESS_001':       'doc/adr/ADR-ACCESS-001.md',
  'CORENULL_ROADMAP':     'doc/status/CORENULL_ROADMAP.md',
  'DEV_CONTEXT_SUMMARY':  'doc/status/DEV_CONTEXT_SUMMARY.md',
  'DOC_INDEX':            'doc/DOC_INDEX.md',
};

// 클로2 기본 주입 문서 목록 (기존 동작 - 이름/구조 그대로 유지)
const CLAUDE2_DOCS = ['Master_Prompt_v2.0', 'Agents_Directive', 'clo2'];

// 에이전트별 문서 패키지 (신규). clo4/clo5는 기존처럼 ?file=clo4 단일 조회로
// 이미 가능하므로 별도 패키지를 만들지 않고 그대로 둔다.
// clo3 패키지에서 CoreNull_Seed_System은 의도적으로 제외한다 — 하준아이는
// CoreNull의 공간 원리(House-Room-Message)만 이식받았을 뿐, 씨앗/열매/서재
// 개념은 가져오지 않기로 오늘 확정했기 때문.
const AGENT_DOCS: Record<string, string[]> = {
  clo2: ['Master_Prompt_v2.0', 'Agents_Directive', 'clo2'],
  clo3: ['Master_Prompt_v2.0', 'Agents_Directive', 'clo3'],
  pm:   ['Master_Prompt_v2.0', 'Agents_Directive', 'WORKFLOW', 'PM_GUARD', 'pm'],
};

async function fetchDoc(key: string): Promise<string> {
  const path = DOC_MAP[key];
  if (!path) return `[문서 경로 미확인: ${key}]`;
  const res = await fetch(`${GITHUB_RAW_BASE}/${path}`, { cache: 'no-store' });
  return res.ok ? await res.text() : `[fetch 실패: ${res.status}]`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const file  = searchParams.get('file') || 'Master_Prompt_v2.0';
  const agent = searchParams.get('agent'); // ?agent=clo2 등 → 해당 에이전트 기본 문서

  try {
    // ?agent=claude2 → 클로2 기본 문서 일괄 반환 (기존 동작, 그대로 유지)
    if (agent === 'claude2') {
      const results: Record<string, string> = {};
      for (const key of CLAUDE2_DOCS) {
        results[key] = await fetchDoc(key);
      }
      return Response.json({
        agent: 'claude2',
        docs: results,
        fetched_at: new Date().toISOString(),
      });
    }

    // ?agent=clo2|clo3|pm → 에이전트별 문서 패키지 (신규)
    if (agent && AGENT_DOCS[agent]) {
      const results: Record<string, string> = {};
      for (const key of AGENT_DOCS[agent]) {
        results[key] = await fetchDoc(key);
      }
      return Response.json({
        agent,
        docs: results,
        fetched_at: new Date().toISOString(),
      });
    }

    if (agent) {
      return Response.json({
        _error: `지원하지 않는 agent: ${agent}`,
        available_agents: ['claude2', ...Object.keys(AGENT_DOCS)],
      });
    }

    // ?file=all → 주요 문서 전체
    if (file === 'all') {
      const results: Record<string, string> = {};
      for (const key of Object.keys(DOC_MAP)) {
        results[key] = await fetchDoc(key);
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
        _error: `찾을 수 없는 문서: ${file}`,
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