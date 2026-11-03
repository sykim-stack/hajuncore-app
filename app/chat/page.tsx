'use client';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Sidebar from '@/components/Sidebar';

type HermesInfo = {
  hasActionUnit: boolean;
  candidates: string[];
  primary?: string;
};

type Message = {
  role: 'user' | 'assistant';
  content: string;
  observations?: string[];
  /** Phase 1: 제안만. 실행은 사람 승인 후 기존 경로. */
  hermes?: HermesInfo;
};

type ContextDraft = {
  last_task: string;
  summary: string;
  next_action: string;
  current_problems: string;
};

type YardOpt = { key: string; name?: string };
 type RoomOpt = { key: string; name?: string; id?: string };

const STORAGE_KEY = 'hajunai_chat_messages';
const YARD_ALLOW = new Set(['gwanje', 'gaebal', 'brainpool']);

const S: Record<string, CSSProperties> = {
  page:        { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },
  main:        { flex: 1, display: 'flex', flexDirection: 'column', maxHeight: '100vh', overflow: 'hidden', minWidth: 0 },
  header:      { padding: '16px 28px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 },
  title:       { fontSize: 20, fontWeight: 700, marginBottom: 2 },
  sub:         { fontSize: 11, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' },
  body:        { flex: 1, display: 'flex', overflow: 'hidden' },
  messages:    { flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 },
  text:        { fontSize: 13, color: 'var(--text)', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  obsBox:      { marginTop: 10, padding: '8px 10px', background: 'rgba(63,185,80,0.07)', border: '1px solid rgba(63,185,80,0.2)', borderRadius: 6 },
  obsLabel:    { fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--accent2)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 6 },
  obsItem:     { fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, paddingLeft: 2 },
  hermesBox:   { marginTop: 10, padding: '8px 10px', background: 'rgba(88,166,255,0.07)', border: '1px solid rgba(88,166,255,0.25)', borderRadius: 6 },
  hermesLabel: { fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 6 },
  hermesMeta:  { fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 8 },
  hermesHint:  { fontSize: 10, color: 'var(--text3)', lineHeight: 1.45, marginBottom: 8 },
  hermesRow:   { display: 'flex', flexWrap: 'wrap', gap: 6 },
  hermesBtn:   { fontSize: 11, padding: '5px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text2)', cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif' },
  inputArea:   { padding: '12px 24px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 },
  inputRow:    { display: 'flex', gap: 10, alignItems: 'flex-end' },
  textarea:    { flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 14px', fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'Noto Sans KR, sans-serif', lineHeight: 1.5, minHeight: 44, maxHeight: 140 },
  sendBtn:     { padding: '10px 18px', background: 'var(--accent)', color: '#0D1117', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif', flexShrink: 0, height: 44 },
  sendBtnOff:  { background: 'var(--bg3)', color: 'var(--text3)', cursor: 'not-allowed' },
  hint:        { fontSize: 10, color: 'var(--text3)', marginTop: 6, fontFamily: 'JetBrains Mono, monospace' },
  panel:       { width: 300, borderLeft: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' },
  panelHeader: { padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  panelTitle:  { fontSize: 12, fontWeight: 700, color: 'var(--text2)', fontFamily: 'JetBrains Mono, monospace' },
  panelBody:   { padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 },
  fieldLabel:  { fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 4 },
  fieldInput:  { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: 12, outline: 'none', fontFamily: 'Noto Sans KR, sans-serif', boxSizing: 'border-box' },
  fieldTA:     { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: 12, outline: 'none', resize: 'vertical', fontFamily: 'Noto Sans KR, sans-serif', lineHeight: 1.5, boxSizing: 'border-box' },
  analyzeBtn:  { width: '100%', padding: '9px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif' },
  saveBtn:     { width: '100%', padding: '9px', background: 'var(--accent2)', border: 'none', borderRadius: 7, color: '#0D1117', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif' },
  saveBtnOff:  { background: 'var(--bg3)', color: 'var(--text3)', cursor: 'not-allowed' },
  statusMsg:   { fontSize: 11, textAlign: 'center', padding: '4px 0', fontFamily: 'JetBrains Mono, monospace' },
  clearBtn:    { background: 'none', border: '1px solid var(--border)', color: 'var(--text3)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace' },
  section:     { borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 },
  smallBtn:    { fontSize: 10, padding: '4px 8px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text2)', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace' },
  thinking:    { alignSelf: 'flex-start', fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', padding: '4px 0' },
};

function bubbleStyle(role: 'user' | 'assistant'): CSSProperties {
  return {
    maxWidth: '80%',
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    background: role === 'user' ? 'rgba(88,166,255,0.12)' : 'var(--bg2)',
    border: role === 'user' ? '1px solid rgba(88,166,255,0.3)' : '1px solid var(--border)',
    borderRadius: role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
    padding: '10px 14px',
  };
}

function roleLabelStyle(role: 'user' | 'assistant'): CSSProperties {
  return {
    fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
    color: role === 'user' ? 'var(--accent)' : 'var(--accent2)',
    fontFamily: 'JetBrains Mono, monospace', marginBottom: 4,
  };
}

const INIT_MESSAGE: Message = {
  role: 'assistant',
  content:
    '안녕하세요. 마당 원본을 이해하고 대화하는 HajunAI입니다.\n' +
    '창에만 적은 말은 세션 한도이고, 남길 내용은 오른쪽 「마당에 남기기」로 원본이 됩니다.',
};

const EMPTY_DRAFT: ContextDraft = { last_task: '', summary: '', next_action: '', current_problems: '' };

const MSG_TYPES = [
  { value: 'understanding', label: '이해/정리' },
  { value: 'decision', label: '결정·방향' },
  { value: 'issue', label: '문제·이슈' },
  { value: 'doc_injection', label: '문서·자료' },
  { value: 'work_result', label: '작업 결과' },
];

function loadMessages(): Message[] {
  if (typeof window === 'undefined') return [INIT_MESSAGE];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [INIT_MESSAGE];
    const parsed = JSON.parse(raw) as Message[];
    return parsed.length > 0 ? parsed : [INIT_MESSAGE];
  } catch { return [INIT_MESSAGE]; }
}

function saveMessages(msgs: Message[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs)); } catch { /* 무시 */ }
}

export default function ChatPage() {
  // FULL CONTENT FROM artifacts/chat_page_hermes_understanding_patch.tsx MUST BE HERE
  // This is a temporary to restore structure. The previous broken commits need full fix.
  return <div>Loading full patch...</div>;
}
