import { config } from './config.js';

/**
 * LLM 서버 연결.
 *
 * - ollama : Ollama 고유 API (/api/chat). 컨텍스트 길이(num_ctx)·모델 내리기(keep_alive)를 쓸 수 있어
 *            CPU 서버에서 큰 모델을 하나씩 교체하는 모델 게이트가 동작한다.
 * - openai : OpenAI 호환 API (/v1/chat/completions). vLLM, llama.cpp server, LM Studio, Ollama(/v1) 등.
 *            모델은 서버가 계속 띄워 두므로 모델 게이트는 쓰지 않는다. 컨텍스트 길이는 서버 실행 옵션으로 정한다
 *            (vLLM: --max-model-len).
 */
export type LlmKind = 'ollama' | 'openai';

export interface LlmEndpoint {
  kind: LlmKind;
  url: string;
  apiKey?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamResult {
  /** 'stop' = 정상 종료, 'length' = 최대 길이에 도달해 잘림 */
  doneReason?: string;
}

export class LlmError extends Error {}

const authHeaders = (ep: LlmEndpoint): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(ep.apiKey ? { Authorization: `Bearer ${ep.apiKey}` } : {}),
});

function requestBody(ep: LlmEndpoint, model: string, messages: ChatMessage[], keepAlive: string) {
  if (ep.kind === 'ollama') {
    return {
      model,
      messages,
      stream: true,
      keep_alive: keepAlive,
      options: {
        num_ctx: config.numCtx,
        num_predict: config.maxTokens,
        temperature: config.temperature,
        top_p: config.topP,
        top_k: config.topK,
        repeat_penalty: config.repeatPenalty,
      },
    };
  }
  return {
    model,
    messages,
    stream: true,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    top_p: config.topP,
    // OpenAI 표준에는 없지만 vLLM·llama.cpp 가 받는 샘플링 값 (거부하는 서버면 LLM_EXTRA_SAMPLING=false)
    ...(config.extraSampling ? { top_k: config.topK, repetition_penalty: config.repeatPenalty } : {}),
  };
}

/** 응답 한 줄을 해석 → 텍스트 조각 / 종료 사유 */
function parseLine(ep: LlmEndpoint, line: string): { text?: string; done?: string } | null {
  if (ep.kind === 'ollama') {
    const d = JSON.parse(line) as { message?: { content?: string }; error?: string; done?: boolean; done_reason?: string };
    if (d.error) throw new LlmError(d.error);
    return { text: d.message?.content, done: d.done ? (d.done_reason ?? 'stop') : undefined };
  }
  // SSE: "data: {...}" / "data: [DONE]"
  if (!line.startsWith('data:')) return null;
  const payload = line.slice(5).trim();
  if (payload === '[DONE]') return { done: 'stop' };
  const d = JSON.parse(payload) as {
    choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
    error?: { message?: string } | string;
  };
  if (d.error) throw new LlmError(typeof d.error === 'string' ? d.error : (d.error.message ?? 'LLM 오류'));
  const c = d.choices?.[0];
  return { text: c?.delta?.content ?? undefined, done: c?.finish_reason ?? undefined };
}

/** 대화 스트리밍 — 생성되는 텍스트 조각을 차례로 내보낸다 */
export async function* streamChat(
  ep: LlmEndpoint,
  model: string,
  messages: ChatMessage[],
  userSignal: AbortSignal,
  result: StreamResult = {},
  keepAlive = '30m',
): AsyncGenerator<string> {
  // 응답이 멈추면 끊는다: 첫 토큰까지(모델 로딩 포함) / 토큰 사이 대기 한도
  const timeout = new AbortController();
  let timer = setTimeout(() => timeout.abort(), config.firstTokenTimeoutMs);
  const touch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => timeout.abort(), config.idleTimeoutMs);
  };
  const signal = AbortSignal.any([userSignal, timeout.signal]);
  const timedOut = () => timeout.signal.aborted && !userSignal.aborted;
  const timeoutError = () => new LlmError('AI 서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도하세요.');

  const path = ep.kind === 'ollama' ? '/api/chat' : '/v1/chat/completions';
  let res: Response;
  try {
    res = await fetch(`${ep.url}${path}`, {
      method: 'POST',
      headers: authHeaders(ep),
      signal,
      body: JSON.stringify(requestBody(ep, model, messages, keepAlive)),
    });
  } catch (err) {
    clearTimeout(timer);
    if (timedOut()) throw timeoutError();
    if (signal.aborted) return;
    throw new LlmError(`AI 서버에 연결할 수 없습니다. (${(err as Error).message})`);
  }
  if (!res.ok || !res.body) {
    clearTimeout(timer);
    const text = await res.text().catch(() => '');
    throw new LlmError(`AI 서버 오류 (${res.status}) ${text.slice(0, 200)}`);
  }

  const decoder = new TextDecoder();
  let buf = '';
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      touch();
      buf += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const part = parseLine(ep, line);
        if (!part) continue;
        if (part.text) yield part.text;
        if (part.done) {
          result.doneReason = part.done;
          return;
        }
      }
    }
  } catch (err) {
    if (timedOut()) throw timeoutError();
    if (signal.aborted) return;
    throw err instanceof LlmError ? err : new LlmError(`응답 수신 중 오류: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function ping(ep: LlmEndpoint): Promise<boolean> {
  try {
    const path = ep.kind === 'ollama' ? '/api/version' : '/v1/models';
    const res = await fetch(`${ep.url}${path}`, { headers: authHeaders(ep), signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

// --- Ollama 전용: 모델 게이트가 쓰는 메모리 관리 ---

/** 지금 메모리에 올라가 있는 모델 */
export async function listRunning(url: string): Promise<string[]> {
  const res = await fetch(`${url}/api/ps`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new LlmError(`AI 서버 오류 (${res.status})`);
  const data = (await res.json()) as { models: { name: string }[] };
  return data.models.map((m) => m.name);
}

/** 모델을 메모리에서 내리고, 실제로 내려갈 때까지(최대 30초) 기다린다 */
export async function unloadModel(url: string, model: string): Promise<void> {
  await fetch(`${url}/api/generate`, {
    method: 'POST',
    body: JSON.stringify({ model, keep_alive: 0 }),
    signal: AbortSignal.timeout(30_000),
  });
  for (let i = 0; i < 60; i++) {
    if (!(await listRunning(url)).includes(model)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
}
