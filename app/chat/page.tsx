'use client';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Sidebar from '@/components/Sidebar';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  observations?: string[];
};

// 정적 스타일 (함수 제외)
const S: Record<string, CSSProperties> = {
  page: { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '100vh',
    overflow: 'hidden',
  },
  header: {
    padding: '20px 28px 12px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg2)',
    flexShrink: 0,
  },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 2 },
  sub: {
    fontSize: 11,
    color: 'var(--text3)',
    fontFamily: 'JetBrains Mono, monospace',
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  text: {
    fontSize: 13,
    color: 'var(--text)',
    lineHeight: 1.65,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  obsBox: {
    marginTop: 10,
    padding: '8px 10px',
    background: 'rgba(63,185,80,0.07)',
    border: '1px solid rgba(63,185,80,0.2)',
    borderRadius: 6,
  },
  obsLabel: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'var(--accent2)',
    fontFamily: 'JetBrains Mono, monospace',
    marginBottom: 6,
  },
  obsItem: {
    fontSize: 12,
    color: 'var(--text2)',
    lineHeight: 1.6,
    paddingLeft: 2,
  },
  inputArea: {
    padding: '14px 28px 20px',
    borderTop: '1px solid var(--border)',
    background: 'var(--bg2)',
    flexShrink: 0,
  },
  inputRow: { display: 'flex', gap: 10, alignItems: 'flex-end' },
  textarea: {
    flex: 1,
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    padding: '10px 14px',
    fontSize: 13,
    outline: 'none',
    resize: 'none',
    fontFamily: 'Noto Sans KR, sans-serif',
    lineHeight: 1.5,
    minHeight: 44,
    maxHeight: 140,
  },
  sendBtn: {
    padding: '10px 18px',
    background: 'var(--accent)',
    color: '#0D1117',
    border: 'none',
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'Noto Sans KR, sans-serif',
    flexShrink: 0,
    height: 44,
  },
  sendBtnDisabled: {
    background: 'var(--bg3)',
    color: 'var(--text3)',
    cursor: 'not-allowed',
  },
  hint: {
    fontSize: 10,
    color: 'var(--text3)',
    marginTop: 6,
    fontFamily: 'JetBrains Mono, monospace',
  },
  thinking: {
    alignSelf: 'flex-start',
    fontSize: 12,
    color: 'var(--text3)',
    fontStyle: 'italic',
    padding: '4px 0',
  },
};

// 동적 스타일 헬퍼 (S 객체 밖)
function bubbleStyle(role: 'user' | 'assistant'): CSSProperties {
  return {
    maxWidth: '78%',
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    background: role === 'user' ? 'rgba(88,166,255,0.12)' : 'var(--bg2)',
    border:
      role === 'user'
        ? '1px solid rgba(88,166,255,0.3)'
        : '1px solid var(--border)',
    borderRadius:
      role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
    padding: '10px 14px',
  };
}

function roleLabelStyle(role: 'user' | 'assistant'): CSSProperties {
  return {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: role === 'user' ? 'var(--accent)' : 'var(--accent2)',
    fontFamily: 'JetBrains Mono, monospace',
    marginBottom: 4,
  };
}

const INIT_MESSAGE: Message = {
  role: 'assistant',
  content:
    '안녕하세요. 프로젝트 상태나 다음 작업에 대해 물어보세요.\n맥락(contexts)과 씨앗 상태(MindWorld)를 읽고 답합니다.',
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([INIT_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  };

  const send = async () => {
    const msg = input.trim();
    if (!msg || loading) return;

    const userMsg: Message = { role: 'user', content: msg };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }
    setLoading(true);

    const history = nextMessages
      .slice(1)       // INIT_MESSAGE 제외
      .slice(-10)     // 최근 10턴
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch('/api/hajun?action=chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history }),
      });
      const json = await res.json();

      if (json._error) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `오류: ${json._error}` },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: json.reply || '(응답 없음)',
            observations:
              Array.isArray(json.observations) && json.observations.length > 0
                ? json.observations
                : undefined,
          },
        ]);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `네트워크 오류: ${e instanceof Error ? e.message : String(e)}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const clearChat = () => setMessages([INIT_MESSAGE]);

  return (
    <div style={S.page}>
      <Sidebar />
      <main style={S.main}>
        {/* 헤더 */}
        <div style={S.header}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={S.title}>🧠 HajunAI</div>
              <div style={S.sub}>contexts + MindWorld 기반 전략 비서</div>
            </div>
            <button
              onClick={clearChat}
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                color: 'var(--text3)',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              대화 초기화
            </button>
          </div>
        </div>

        {/* 메시지 목록 */}
        <div style={S.messages}>
          {messages.map((m, i) => (
            <div key={i} style={bubbleStyle(m.role)}>
              <div style={roleLabelStyle(m.role)}>
                {m.role === 'user' ? '나' : 'HajunAI'}
              </div>
              <div style={S.text}>{m.content}</div>
              {m.observations && m.observations.length > 0 && (
                <div style={S.obsBox}>
                  <div style={S.obsLabel}>관찰</div>
                  {m.observations.map((obs, j) => (
                    <div
                      key={j}
                      style={{
                        ...S.obsItem,
                        marginBottom:
                          j < (m.observations as string[]).length - 1 ? 4 : 0,
                      }}
                    >
                      · {obs}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {loading && <div style={S.thinking}>HajunAI가 생각 중...</div>}

          <div ref={bottomRef} />
        </div>

        {/* 입력창 */}
        <div style={S.inputArea}>
          <div style={S.inputRow}>
            <textarea
              ref={textareaRef}
              style={S.textarea}
              placeholder="질문을 입력하세요... (Enter 전송, Shift+Enter 줄바꿈)"
              value={input}
              onChange={handleInput}
              onKeyDown={onKeyDown}
              rows={1}
              disabled={loading}
            />
            <button
              style={{
                ...S.sendBtn,
                ...(loading || !input.trim() ? S.sendBtnDisabled : {}),
              }}
              onClick={send}
              disabled={loading || !input.trim()}
            >
              전송
            </button>
          </div>
          <div style={S.hint}>
            세션 대화는 최근 10턴 유지 · 저장: hajunai_conversations
          </div>
        </div>
      </main>
    </div>
  );
}