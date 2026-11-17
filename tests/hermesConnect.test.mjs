/**
 * Hermes 연결 회귀 테스트 (MVP-0)
 *
 * 실제로 돌고 있는 `hermes serve` (127.0.0.1:9119) 에 붙어
 *  1) health
 *  2) 새 세션 생성 + 작업 지시 + 최종 답변 수신
 *  3) stored_session_id(저장된 id) 로 이어 보내기 (연속성)
 *  4) ws-orphan 유예가 지난 뒤에도(= 사람이 나중에 다시 누른 상황) 그 id 로 이어지는가
 * 를 확인한다. 에이전트 턴 3회를 실제로 소비한다 (모델 호출 발생).
 *
 * 왜 3) 이 runtime id 가 아니라 stored id 인가:
 *   runtime id(first.session_id) 는 이 소켓이 닫히면 detach 되고 ws-orphan reaper 가 유예(기본 20초)
 *   뒤에 회수한다. 그 값을 브라우저에 남겨 두면 다음 실행의 prompt.submit 이 4001 session not found
 *   로 거절된다(2026-11-15 16:03 / 16:18 실측). 저장된 id 는 DB 행이라 남아 있고,
 *   session.resume(stored id) → 새 runtime id → prompt.submit 으로 이어간다.
 *
 * 실행: npm run test:hermes:connect
 * 백엔드가 없으면 health 단계에서 _error 와 함께 실패한다 (조용히 통과하지 않음).
 */

import { hermesHealth, hermesRun } from '../lib/hermesClient.ts';

let passed = 0;
let failed = 0;

function check(name, ok, extra) {
  if (ok) {
    passed += 1;
    console.log(`✓ ${name}`);
  } else {
    failed += 1;
    console.error(`✗ ${name}`, extra ?? '');
  }
}

// 1) 백엔드 생존
const health = await hermesHealth();
check('hermes serve 도달', health.reachable === true, health);
console.log(`  version=${health.version ?? '-'} auth_required=${health.auth_required}`);

if (!health.reachable) {
  console.error('\nhermes serve 가 실행 중이어야 합니다: `hermes serve` (기본 9119)');
  process.exit(1);
}

// 2) 새 세션 + 작업 지시
const first = await hermesRun({
  prompt: 'Reply with exactly: HERMES-CONNECT-OK',
  timeout_ms: 300_000,
});
check('첫 작업 최종 답변 수신', !first._error && !!first.text, first._error ?? first);
check(
  '답변 내용 일치',
  typeof first.text === 'string' && first.text.includes('HERMES-CONNECT-OK'),
  first.text
);
check('session_id 반환', typeof first.session_id === 'string' && first.session_id.length > 0);
check(
  '이벤트 스트림 수신',
  Array.isArray(first.events) && first.events.some((e) => e.includes('message.complete')),
  first.events?.slice(-5)
);
console.log(
  `  session=${first.session_id} status=${first.status} tokens=${first.usage?.total ?? '-'} ${first.duration_ms}ms`
);

// 3) 이어 보내기 — 이어가는 열쇠는 '저장된 id'(stored_session_id) 다.
//    새 세션이 만들어지면 연속성이 깨진 것이고, 4001 이면 애초에 이어지지 못한 것이다.
const key = first.stored_session_id || first.session_id || '';
check('stored_session_id 반환', !!first.stored_session_id, first);

if (key) {
  const second = await hermesRun({
    prompt: '앞에서 내가 시킨 문장을 그대로 다시 출력해.',
    session_id: key,
    timeout_ms: 300_000,
  });
  check('저장된 id 로 이어 보내기 (4001 아님)', !second._error && !!second.text, second._error ?? second);
  // 이어졌다면 앞선 지시(HERMES-CONNECT-OK)가 답에 남아 있어야 한다.
  check(
    '이어붙은 이력이 답에 남아 있다',
    typeof second.text === 'string' && second.text.includes('HERMES-CONNECT-OK'),
    second.text
  );
  check('저장된 id 유지', (second.stored_session_id ?? key) === key, {
    before: first.stored_session_id,
    after: second.stored_session_id,
  });
  console.log(`  이어서: ${second.text?.slice(0, 120)}`);
}

// 4) 유예 경과 뒤 재실행 — 사람이 몇 분 뒤에 다시 누른 상황. runtime id 는 이미 회수됐다.
const reapWaitMs = Number(process.env.HERMES_TEST_REAP_WAIT_MS ?? 30_000);
if (key) {
  console.log(`  ws-orphan 유예 경과 대기 ${reapWaitMs}ms …`);
  await new Promise((resolve) => setTimeout(resolve, reapWaitMs));
  const third = await hermesRun({
    prompt: 'Reply with exactly: HERMES-RESUME-OK',
    session_id: key,
    timeout_ms: 300_000,
  });
  check('유예 경과 후에도 저장된 id 로 이어진다', !third._error && !!third.text, third._error ?? third);
  check(
    '답변 내용 일치 (재개 턴)',
    typeof third.text === 'string' && third.text.includes('HERMES-RESUME-OK'),
    third.text
  );
  check('같은 저장된 세션 유지', (third.stored_session_id ?? key) === key, {
    before: key,
    after: third.stored_session_id,
  });
  console.log(`  재개: session=${third.session_id} ${third.duration_ms}ms`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
