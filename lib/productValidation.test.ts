import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInternalCode,
  findDuplicateProduct,
  normalizeProductMetadata,
  selectRandomCandidate,
  uniqueProductCandidates,
  withReviewStatus,
  isReviewPendingMetadata,
  type ProductCandidateMessage,
} from './productValidation.ts';

const message = (id: string, code: string, createdAt = '2026-09-09T00:00:00Z'): ProductCandidateMessage => ({
  id,
  content: `상품 원문 ${id}`,
  created_at: createdAt,
  metadata: {
    entity_type: 'product_candidate',
    internal_code: code,
    source: code.split(':')[0],
    source_product_code: code.split(':')[1],
  },
});

test('source와 source_product_code로 internal_code를 만든다', () => {
  assert.equal(buildInternalCode(' OnChannel ', ' CH-001 '), 'onchannel:CH-001');
  assert.equal(buildInternalCode('', 'CH-001'), null);
});

test('상품 metadata를 정규화하고 식별자 누락을 거부한다', () => {
  assert.equal(normalizeProductMetadata({ source: 'NAVER', source_product_code: 'N-7' })?.internal_code, 'naver:N-7');
  assert.equal(normalizeProductMetadata({ source: 'naver', source_product_code: '' }), null);
  assert.equal(normalizeProductMetadata({ source: 'naver', source_product_code: 'N-7', internal_code: 'naver:other' }), null);
});

test('상품 검토 상태를 기본 검토 대기로 보존한다', () => {
  const metadata = { entity_type: 'product_candidate', internal_code: 'onchannel:A' };
  assert.equal(isReviewPendingMetadata(metadata), true);
  assert.equal(isReviewPendingMetadata(withReviewStatus(metadata, 'confirmed')), false);
  assert.equal(withReviewStatus(metadata, 'adopted').review_status, 'adopted');
  assert.equal(metadata.review_status, undefined);
});

test('같은 internal_code는 후보 목록에서 한 번만 남긴다', () => {
  const candidates = [message('first', 'onchannel:A'), message('duplicate', 'ONCHANNEL:A'), message('second', 'onchannel:B')];
  assert.deepEqual(uniqueProductCandidates(candidates).map((item) => item.id), ['first', 'second']);
});

test('새 캡처가 기존 후보와 중복인지 찾고 원문은 변경하지 않는다', () => {
  const existing = [message('original', 'onchannel:A')];
  const incoming = normalizeProductMetadata({ source: 'onchannel', source_product_code: 'A' });
  assert.ok(incoming);
  const match = findDuplicateProduct(incoming, existing);
  assert.equal(match?.existing.id, 'original');
  assert.equal(existing[0].content, '상품 원문 original');
});

test('랜덤 선택은 중복 제거된 후보에서 원문 ID를 반환한다', () => {
  const candidates = [message('a', 'onchannel:A'), message('a-copy', 'onchannel:A'), message('b', 'onchannel:B')];
  assert.equal(selectRandomCandidate(candidates, () => 0.99)?.id, 'b');
  assert.equal(selectRandomCandidate([], () => 0.5), null);
});
