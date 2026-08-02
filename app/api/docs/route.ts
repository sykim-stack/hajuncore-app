// app/api/docs/route.ts
// brainpool-os GitHub 臾몄꽌瑜?fetch?댁꽌 諛섑솚
// Claude媛 吏곸젒 GitHub raw URL???묎렐 紐삵븯??臾몄젣 ?닿껐
// GET /api/docs?file=Master_Prompt_v2.0
// GET /api/docs?file=Agents_Directive
// GET /api/docs?file=all  ??二쇱슂 臾몄꽌 ?꾩껜

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
};

// ?대줈2 湲곕낯 二쇱엯 臾몄꽌 紐⑸줉
const CLAUDE2_DOCS = ['Master_Prompt_v2.0', 'Agents_Directive', 'clo2'];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const file  = searchParams.get('file') || 'Master_Prompt_v2.0';
  const agent = searchParams.get('agent'); // ?agent=claude2 ???대떦 ?먯씠?꾪듃 湲곕낯 臾몄꽌

  try {
    // ?agent=claude2 ???대줈2 湲곕낯 臾몄꽌 ?쇨큵 諛섑솚
    if (agent === 'claude2') {
      const results: Record<string, string> = {};
      for (const key of CLAUDE2_DOCS) {
        const path = DOC_MAP[key];
        if (!path) continue;
        const res = await fetch(`${GITHUB_RAW_BASE}/${path}`, { cache: 'no-store' });
        results[key] = res.ok ? await res.text() : `[fetch ?ㅽ뙣: ${res.status}]`;
      }
      return Response.json({
        agent: 'claude2',
        docs: results,
        fetched_at: new Date().toISOString(),
      });
    }

    // ?file=all ???꾩껜 臾몄꽌
    if (file === 'all') {
      const results: Record<string, string> = {};
      for (const [key, path] of Object.entries(DOC_MAP)) {
        const res = await fetch(`${GITHUB_RAW_BASE}/${path}`, { cache: 'no-store' });
        results[key] = res.ok ? await res.text() : `[fetch ?ㅽ뙣: ${res.status}]`;
      }
      return Response.json({
        docs: results,
        fetched_at: new Date().toISOString(),
      });
    }

    // ?file=Master_Prompt_v2.0 ???⑥씪 臾몄꽌
    const path = DOC_MAP[file];
    if (!path) {
      return Response.json({
        _error: `?????녿뒗 臾몄꽌: ${file}`,
        available: Object.keys(DOC_MAP),
      });
    }

    const res = await fetch(`${GITHUB_RAW_BASE}/${path}`, { cache: 'no-store' });
    if (!res.ok) {
      return Response.json({ _error: `GitHub fetch ?ㅽ뙣: ${res.status}` });
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