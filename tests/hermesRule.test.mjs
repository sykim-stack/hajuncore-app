/**
 * Hermes Phase 0 — 규칙 함수 자동 회귀 테스트
 * ADR-HERMES-000 기준 5문장 + 날씨 false-positive.
 * 규칙 함수만 호출. chat API / DB 미접근.
 *
 * 실행: npm run test:hermes
 */

import { evaluateHermesRule } from '../lib/hermesRule.ts';

const cases = [
  {
    name: '안녕',
    utterance: '안녕',
    understanding: null,
    expectUnit: false,
    expectIncludes: ['보류'],
    expectPrimary: '보류',
  },
  {
    name: '이건 중요해',
    utterance: '이건 중요해',
    understanding: '기존 이해 요약',
    expectUnit: true,
    expectIncludes: ['이해갱신', '확인질문'],
  },
  {
    name: '전에 말한 것과 달라',
    utterance: '전에 말한 것과 달라',
    understanding: '이전 결정 내용',
    expectUnit: true,
    expectIncludes: ['이해갱신', '연결', '확인질문'],
  },
  {
    name: '이건 기록해줘',
    utterance: '이건 기록해줘',
    understanding: null,
    expectUnit: true,
    expectIncludes: ['남김'],
  },
  {
    name: '잘 모르겠어',
    utterance: '잘 모르겠어',
    understanding: '일부 이해',
    expectUnit: true,
    expectIncludes: ['확인질문'],
  },
  {
    name: '날씨 false-positive',
    utterance: '오늘 날씨 좋다',
    understanding: null,
    expectUnit: false,
    expectIncludes: ['보류'],
    expectPrimary: '보류',
  },
];

let passed = 0;
let failed = 0;

for (const c of cases) {
  const got = evaluateHermesRule({
    utterance: c.utterance,
    understanding: c.understanding,
  });
  const unitOk = got.hasActionUnit === c.expectUnit;
  const includesOk =
    !c.expectIncludes ||
    c.expectIncludes.every((x) => got.candidates.includes(x));
  const primaryOk = !c.expectPrimary || got.primary === c.expectPrimary;
  const ok = unitOk && includesOk && primaryOk;
  if (ok) {
    passed += 1;
    console.log(`✓ ${c.name}`);
  } else {
    failed += 1;
    console.error(`✗ ${c.name}`, {
      expectUnit: c.expectUnit,
      gotUnit: got.hasActionUnit,
      expectIncludes: c.expectIncludes,
      gotCandidates: got.candidates,
      expectPrimary: c.expectPrimary,
      gotPrimary: got.primary,
      reason: got.reason_brief,
    });
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
