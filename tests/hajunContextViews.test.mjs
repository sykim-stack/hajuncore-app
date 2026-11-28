import assert from 'node:assert/strict';
import {
  CONTEXT_VIEW_KEYS,
  CONTEXT_VIEW_DEFINITIONS,
  buildContextViewAnalysisPrompt,
  KNOWN_YARD_ROOMS,
  suggestRoomKeyForView,
  isKnownRoomKey,
} from '../lib/hajunContextViews.ts';

assert.deepEqual(CONTEXT_VIEW_KEYS, ['gwanje', 'gaebal', 'brainpool']);
assert.match(CONTEXT_VIEW_DEFINITIONS.gwanje.purpose, /실제 사용자/);
assert.match(CONTEXT_VIEW_DEFINITIONS.gaebal.purpose, /CoreNull, CoreChat, CoreRing, CoreHub, HajunAI/);
assert.match(CONTEXT_VIEW_DEFINITIONS.brainpool.purpose, /핵심 철학/);

const prompt = buildContextViewAnalysisPrompt({
  sourceMessageId: 'msg-1',
  sourceContent: '테스트 원본',
  sourceType: 'understanding',
});
assert.match(prompt, /msg-1/);
assert.match(prompt, /테스트 원본/);
assert.match(prompt, /gwanje/);
assert.match(prompt, /읽기 전용/);

assert.deepEqual([...KNOWN_YARD_ROOMS.brainpool], ['brainpool']);
assert.equal(suggestRoomKeyForView('brainpool'), 'brainpool');
assert.equal(suggestRoomKeyForView('gwanje'), null);
assert.equal(suggestRoomKeyForView('gaebal', ['CoreRing']), 'corering');
assert.equal(suggestRoomKeyForView('gaebal', []), null);
assert.equal(isKnownRoomKey('gaebal', 'corering'), true);
assert.equal(isKnownRoomKey('gaebal', 'default'), false);
assert.equal(isKnownRoomKey('gwanje', 'lang_meaning'), true);

console.log('hajunContextViews.test.mjs: ok');
