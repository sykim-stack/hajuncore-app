// lib/buildChatSystemPrompt.ts
// SPEC-Hermes-system-prompt-phase0-2026-11-24 §4 조립
import { HERMES_SYSTEM_PROMPT_PHASE0, formatHermesHint, type HermesJudgment } from '@/lib/hermesRule';

export function buildChatSystemPrompt(opts: {
  contextSummary: string;
  mindWorldSummary: string;
  understandingText: string | null;
  hermesJudgment: HermesJudgment;
}): string {
  const hermesHint = formatHermesHint(opts.hermesJudgment);
  return (
    HERMES_SYSTEM_PROMPT_PHASE0 +
    `\n\n---\n당신은 HajunAI입니다. 챗봇이 아닙니다.\n` +
    `마당에 쌓인 원본을 이해하고 사람과 말합니다.\n` +
    `근거 없는 사실 금지. 한국어만. 마크다운 금지.\n\n` +
    `개발 맥락:\n${opts.contextSummary}\n\n` +
    `MindWorld:\n${opts.mindWorldSummary}\n\n` +
    `이해:\n${opts.understandingText || '없음'}` +
    hermesHint
  );
}
