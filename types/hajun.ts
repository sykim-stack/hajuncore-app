// types/hajun.ts
// 하준아이 마당·거실·방 구조 타입
// Single Source of Truth: hajun_yards / hajun_rooms / hajun_messages
// (기존 types/hajunai.ts의 DevContext/KnowledgeUnit과는 별개 — 구 스키마 건드리지 않음)

export type AuthorType = 'human' | 'ai';

export type MsgType =
  | 'doc_injection'
  | 'understanding'
  | 'question'
  | 'answer'
  | 'decision'
  | 'issue'
  | 'work_result';

export type HajunYard = {
  id: string;
  key: string;
  name: string;
  created_at: string;
};

export type HajunRoom = {
  id: string;
  yard_id: string;
  key: string;
  name: string;
  created_at: string;
};

export type HajunMessage = {
  id: string;
  room_id: string;
  author_type: AuthorType;
  author_name: string;
  msg_type: MsgType;
  content: string;
  ref_ids: string[];
  created_at: string;
};

export type HajunRoomWithMessages = HajunRoom & { messages: HajunMessage[] };
export type HajunRoomWithLatest    = HajunRoom & { latest: HajunMessage | null };

export const MSG_TYPE_LABEL: Record<MsgType, string> = {
  doc_injection: '문서주입',
  understanding: '이해/정리',
  question:      '질문',
  answer:        '답변',
  decision:      '결정',
  issue:         '이슈',
  work_result:   '작업결과',
};

export const MSG_TYPE_COLOR: Record<MsgType, string> = {
  question:      '#58A6FF',
  understanding: '#3FB950',
  answer:        '#F0883E',
  decision:      '#D2A8FF',
  issue:         '#F78166',
  doc_injection: '#8B949E',
  work_result:   '#39C5CF',
};

export const MSG_TYPE_ORDER: MsgType[] = [
  'question', 'understanding', 'answer', 'decision', 'issue', 'doc_injection', 'work_result',
];

export const YARD_LABEL: Record<string, string> = {
  gwanje: '관제마당',
  gaebal: '개발마당',
  brainpool: '브라이언풀마당',
};