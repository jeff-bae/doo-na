import { config } from './config.js';
import type { ChatMessage } from './ollama.js';

/**
 * 토큰 수 대략 추정. 한글은 글자당 약 1토큰, 영문/코드는 약 4글자당 1토큰.
 * 정확할 필요는 없고, 컨텍스트 초과를 막을 정도면 충분하다.
 */
export function estimateTokens(text: string): number {
  let cjk = 0;
  for (const ch of text) if (ch.charCodeAt(0) > 0x2e80) cjk++;
  return Math.ceil(cjk + (text.length - cjk) / 4) + 4;
}

/** 시스템 프롬프트 + 최근 메시지를 컨텍스트 한도 안에서 최대한 담는다. */
export function buildContext(history: ChatMessage[], systemPrompt: string): ChatMessage[] {
  const system: ChatMessage = { role: 'system', content: systemPrompt };
  let budget = config.numCtx - config.responseReserve - estimateTokens(system.content);

  const picked: ChatMessage[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!;
    const cost = estimateTokens(m.content);
    // 가장 최근 질문은 너무 길어도 반드시 포함 (Ollama가 앞부분을 잘라냄)
    if (cost > budget && picked.length > 0) break;
    budget -= cost;
    picked.unshift(m);
  }
  // 대화는 user 메시지로 시작하도록 정리
  while (picked.length > 1 && picked[0]!.role !== 'user') picked.shift();
  return [system, ...picked];
}
