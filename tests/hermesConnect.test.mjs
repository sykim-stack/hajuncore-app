/**
 * Hermes 연결 회귀 테스트 (MVP-0)
 *
 * 실제로 돌고 있는 \`hermes serve\` (127.0.0.1:9119) 에 붙어
 *  1) health
 *  2) 새 세션 생성 + 작업 지시 + 최종 답변 수신
 *  3) stored_session_id 로 resume 한 뒤 대화 연속성
 * 를 확인한다. 에이전트 턴 2회를 실제로 소비한다 (모델 호출 발생).
 *
 * 실행: npm run test:hermes:connect
 * 백엔드가 없으면 health 단계에서 실패한다 (조용히 통과하지 않음).
 */

import { hermesHealth, hermesRun } from '../lib/hermesClient.ts';

let passed = 0;
let failed = 0;

function check(name, ok, extra) {
  if (ok) {
    passed += 1;
    console.log('✓ ' + name);
  } else {
    failed += 1;
    console.error('✗ ' + name, extra ?? '');
  }
}

function printSummary() {
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
}

// 1) 백엔드 생존
const health = await hermesHealth();
check('hermes serve 도달', health.reachable === true, health);
console.log('  version=' + (health.version ?? '-') + ' auth_required=' + health.auth_required);

if (!health.reachable) {
  console.error('\nhermes serve 가 실행 중이어야 합니다: hermes serve (기본 9119)');
  printSummary();
  process.exit(1);
}

// 2) 새 세션 + 작업 지시
const first = await hermesRun({
  prompt: 'Reply with exactly: HERMES-CONNECT-OK',
  timeout_ms: 300_000,
});

const firstHasExpectedText =
  typeof first.text === 'string' && first.text.includes('HERMES-CONNECT-OK');
const firstHasRuntimeSession =
  typeof first.session_id === 'string' && first.session_id.length > 0;
const firstHasStoredSession =
  typeof first.stored_session_id === 'string' && first.stored_session_id.length > 0;
const firstHasCompletionEvent =
  Array.isArray(first.events) && first.events.some(
    (e) => typeof e === 'string' && e.includes('message.complete')
  );

check('첫 작업 최종 답변 수신', !first._error && first.status === 'complete' && !!first.text, first._error ?? first);
check('첫 작업 status=complete', first.status === 'complete', first.status);
check('답변 내용 일치', firstHasExpectedText, first.text);
check('session_id 반환', firstHasRuntimeSession, first.session_id);
check('이벤트 스트림 수신', firstHasCompletionEvent, first.events?.slice(-5));
check('stored_session_id 반환', firstHasStoredSession, first.stored_session_id);

console.log(
  '  session=' + (first.session_id ?? '-') +
  ' status=' + (first.status ?? '-') +
  ' tokens=' + (first.usage?.total ?? '-') +
  ' ' + (first.duration_ms ?? '-') + 'ms'
);

// 첫 작업이 완전히 성공하지 않았다면 후속 요청을 실행하지 않는다.
// 실패한 첫 턴 뒤의 응답을 연속성 성공으로 오인하지 않도록 조기 종료한다.
const firstTurnPassed =
  !first._error &&
  first.status === 'complete' &&
  firstHasExpectedText &&
  firstHasRuntimeSession &&
  firstHasStoredSession &&
  firstHasCompletionEvent;

if (!firstTurnPassed) {
  console.error('\n첫 작업 검증 실패: 후속 세션 연속성 검증을 실행하지 않습니다.');
  printSummary();
  process.exit(1);
}

// 3) 저장 세션 ID로 resume — 새 런타임 ID를 받아도 대화 연속성이 유지되어야 한다.
const second = await hermesRun({
  prompt: '앞에서 내가 시킨 문장을 그대로 다시 출력해.',
  session_id: first.stored_session_id,
  timeout_ms: 300_000,
});

check(
  '후속 작업 최종 답변 수신',
  !second._error && second.status === 'complete' && !!second.text,
  second._error ?? second
);
check('후속 작업 status=complete', second.status === 'complete', second.status);
check('같은 stored_session_id 유지', second.stored_session_id === first.stored_session_id, {
  before: first.stored_session_id,
  after: second.stored_session_id,
});
check(
  '연속성 유지(앞 문장 기억)',
  typeof second.text === 'string' && second.text.includes('HERMES-CONNECT-OK'),
  second.text
);
console.log('  이어서: ' + (second.text?.slice(0, 120) ?? '-'));

printSummary();
if (failed > 0) process.exit(1);
