import assert from 'node:assert/strict';
import {
  CONTEXT_VIEW_KEYS,
  CONTEXT_VIEW_DEFINITIONS,
  buildContextViewAnalysisPrompt,
} from '../lib/hajunContextViews.ts';

assert.deepEqual(CONTEXT_VIEW_KEYS, ['gwanje', 'gaebal', 'brainpool']);
assert.match(CONTEXT_VIEW_DEFINITIONS.gwanje.purpose, /실제 사용자/);
assert.match(CONTEXT_VIEW_DEFINITIONS.gaebal.purpose, /CoreNull, CoreChat, CoreRing, CoreHub, HajunAI/);
assert.match(CONTEXT_VIEW_DEFINITIONS.brainpool.purpose, /핵심 철학/);

const prompt = buildContextViewAnalysisPrompt({
  sourceMessageId: 'source-1',
  sourceContent: 'CoreRing 번역 연결에서 반복 오류가 발생했다.',
  sourceType: 'issue',
  sourceCreatedAt: '2026-11-27T10:00:00Z',
});

assert.match(prompt, /다섯 엔진방.*세 마당/s);
assert.match(prompt, /하나의 원본을 여러 마당에 연결/);
assert.match(prompt, /원본 메시지, DB, 방, 마당, 연결 관계를 직접 쓰거나 변경하지 않는다/);
assert.match(prompt, /source-1/);
assert.match(prompt, /CoreRing 번역 연결에서 반복 오류가 발생했다/);

console.log('hajunContextViews: all assertions passed');
