import { config } from './config.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class OllamaError extends Error {}

/** Ollama /api/chat 스트리밍 — 생성되는 텍스트 조각을 차례로 내보낸다. */
export interface StreamResult {
  /** 'stop' = 정상 종료, 'length' = 최대 길이에 도달해 잘림 */
  doneReason?: string;
}

export async function* streamChat(
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
  const timeoutError = () => new OllamaError('AI 서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도하세요.');

  let res: Response;
  try {
    res = await fetch(`${config.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
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
      }),
    });
  } catch (err) {
    clearTimeout(timer);
    if (timedOut()) throw timeoutError();
    if (signal.aborted) return;
    throw new OllamaError(`AI 서버에 연결할 수 없습니다. (${(err as Error).message})`);
  }
  if (!res.ok || !res.body) {
    clearTimeout(timer);
    const text = await res.text().catch(() => '');
    throw new OllamaError(`AI 서버 오류 (${res.status}) ${text.slice(0, 200)}`);
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
        const data = JSON.parse(line) as {
          message?: { content?: string };
          error?: string;
          done?: boolean;
          done_reason?: string;
        };
        if (data.error) throw new OllamaError(data.error);
        if (data.message?.content) yield data.message.content;
        if (data.done) {
          result.doneReason = data.done_reason;
          return;
        }
      }
    }
  } catch (err) {
    if (timedOut()) throw timeoutError();
    if (signal.aborted) return;
    throw err instanceof OllamaError ? err : new OllamaError(`응답 수신 중 오류: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** 지금 메모리에 올라가 있는 모델 */
export async function listRunning(): Promise<string[]> {
  const res = await fetch(`${config.ollamaUrl}/api/ps`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new OllamaError(`AI 서버 오류 (${res.status})`);
  const data = (await res.json()) as { models: { name: string }[] };
  return data.models.map((m) => m.name);
}

/** 모델을 메모리에서 내리고, 실제로 내려갈 때까지(최대 30초) 기다린다 */
export async function unloadModel(model: string): Promise<void> {
  await fetch(`${config.ollamaUrl}/api/generate`, {
    method: 'POST',
    body: JSON.stringify({ model, keep_alive: 0 }),
    signal: AbortSignal.timeout(30_000),
  });
  for (let i = 0; i < 60; i++) {
    if (!(await listRunning()).includes(model)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
}

export async function ping(): Promise<boolean> {
  try {
    const res = await fetch(`${config.ollamaUrl}/api/version`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
