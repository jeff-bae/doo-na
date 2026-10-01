/**
 * 두나 도구 하나의 정의.
 *
 * 새 도구 추가 방법:
 *   1. src/tools/<이름>.ts 에 DoonaTool 을 export
 *   2. src/tools/index.ts 의 TOOLS 배열에 추가
 * 모든 도구는 사용자가 입력한 문장(query) 하나를 받아 텍스트 결과를 돌려준다.
 * 결과는 모델이 읽고 답변의 근거로 쓰므로, 사람이 읽기 좋게 짧게 정리해서 돌려준다.
 */
export interface DoonaTool {
  /** 영문 id (MCP 도구 이름) */
  name: string;
  /** 화면에 보이는 이름 */
  title: string;
  emoji: string;
  /** 도구를 골랐을 때 입력창 안내 문구 */
  placeholder: string;
  /** 도구 설명 (MCP description) */
  description: string;
  run(query: string, signal: AbortSignal): Promise<string>;
}

/** 사용자에게 그대로 보여줘도 되는 오류 */
export class ToolError extends Error {}

/** 같은 입력에 대한 결과를 잠시 기억 (외부 서비스 호출을 줄이기 위해) */
export function cached<T>(ttlMs: number, fn: (key: string, signal: AbortSignal) => Promise<T>) {
  const store = new Map<string, { at: number; value: T }>();
  return async (key: string, signal: AbortSignal): Promise<T> => {
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = await fn(key, signal);
    store.set(key, { at: Date.now(), value });
    if (store.size > 200) store.delete(store.keys().next().value!);
    return value;
  };
}

export async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number } = {}, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(init.timeoutMs ?? 10_000);
  try {
    return await fetch(url, { ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  } catch (err) {
    if (timeout.aborted) throw new ToolError('외부 서비스가 제시간에 응답하지 않았습니다.');
    throw new ToolError(`외부 서비스에 연결할 수 없습니다. (${(err as Error).message})`);
  }
}
