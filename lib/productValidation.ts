// HajunAI 상품검증 MVP의 식별·중복 판정 로직
// 원본 저장은 hajun_messages가 담당하며, 이 모듈은 복제 없이 후보를 판정하는 순수 함수만 제공한다.

export type ProductSource = 'onchannel' | 'naver' | string;

export type ProductCandidateMetadata = {
  entity_type: 'product_candidate';
  internal_code: string;
  source: ProductSource;
  source_product_code: string;
  name?: string;
  source_url?: string;
  captured_at?: string;
  [key: string]: unknown;
};

export type ProductCandidateMessage = {
  id: string;
  content: string;
  metadata: ProductCandidateMetadata;
  created_at: string;
};

export type DuplicateMatch = {
  internalCode: string;
  existing: ProductCandidateMessage;
};

/** source와 공급처 상품코드로 안정적인 상품 후보 식별자를 만든다. */
export function buildInternalCode(source: ProductSource, sourceProductCode: string): string | null {
  const normalizedSource = String(source || '').trim().toLowerCase();
  const normalizedCode = String(sourceProductCode || '').trim();
  if (!normalizedSource || !normalizedCode) return null;
  return `${normalizedSource}:${normalizedCode}`;
}

/** 캡처 metadata를 정규화하고 식별자가 없으면 null을 반환한다. */
export function normalizeProductMetadata(
  input: Partial<ProductCandidateMetadata> & { source?: ProductSource; source_product_code?: string },
): ProductCandidateMetadata | null {
  const source = String(input.source || '').trim().toLowerCase();
  const sourceProductCode = String(input.source_product_code || '').trim();
  const internalCode = buildInternalCode(source, sourceProductCode);
  if (!internalCode) return null;

  return {
    ...input,
    entity_type: 'product_candidate',
    internal_code: internalCode,
    source,
    source_product_code: sourceProductCode,
  };
}

/** 후보 메시지를 internal_code별로 1건만 남긴다. 먼저 들어온 원문을 대표로 유지한다. */
export function uniqueProductCandidates(
  messages: ProductCandidateMessage[],
): ProductCandidateMessage[] {
  const seen = new Set<string>();
  return messages.filter((message) => {
    const code = message.metadata.internal_code.trim().toLowerCase();
    if (!code || seen.has(code)) return false;
    seen.add(code);
    return true;
  });
}

/** 새 캡처가 기존 후보와 중복인지 확인한다. 메시지를 수정하거나 복제하지 않는다. */
export function findDuplicateProduct(
  incoming: ProductCandidateMetadata,
  existing: ProductCandidateMessage[],
): DuplicateMatch | null {
  const code = incoming.internal_code.trim().toLowerCase();
  if (!code) return null;
  const match = existing.find((message) => message.metadata.internal_code.trim().toLowerCase() === code);
  return match ? { internalCode: code, existing: match } : null;
}

/** 후보 목록에서 결정론적으로 주입 가능한 난수로 하나를 선택한다. */
export function selectRandomCandidate(
  messages: ProductCandidateMessage[],
  random: () => number = Math.random,
): ProductCandidateMessage | null {
  const candidates = uniqueProductCandidates(messages);
  if (candidates.length === 0) return null;
  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
  return candidates[index];
}
