import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { MessageTool, ToolInfo } from '@doona/shared';
import { config } from './config.js';

/**
 * doona-tools (MCP 서버) 클라이언트.
 * 도구는 모델이 스스로 고르지 않고 사용자가 화면에서 고른다 —
 * 지금 모델(qwen2.5-coder)은 도구 호출 형식과 "언제 부를지" 판단이 불안정해서 (2026-09-30 테스트).
 */

let cache: { at: number; tools: ToolInfo[] } | null = null;

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  if (!config.toolsUrl) throw new Error('도구 서버가 설정되지 않았습니다.');
  const client = new Client({ name: 'doona', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(new URL(config.toolsUrl), {
    requestInit: config.toolsToken ? { headers: { Authorization: `Bearer ${config.toolsToken}` } } : undefined,
  });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

/** 도구 목록 (1분 캐시). 도구 서버가 꺼져 있으면 빈 목록 */
export async function listTools(): Promise<ToolInfo[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.tools;
  try {
    const tools = await withClient(async (c) => (await c.listTools()).tools);
    cache = {
      at: Date.now(),
      tools: tools.map((t) => ({
        name: t.name,
        title: t.title ?? t.name,
        emoji: String(t._meta?.emoji ?? '🔧'),
        placeholder: String(t._meta?.placeholder ?? '도구에 전달할 내용을 입력하세요'),
        description: t.description ?? '',
      })),
    };
    return cache.tools;
  } catch {
    // 잠깐 꺼져 있을 수 있으니 실패는 짧게만 기억
    cache = { at: Date.now() - 50_000, tools: [] };
    return [];
  }
}

/** 도구 실행. 실패해도 예외 대신 isError 결과를 돌려준다 (모델이 사용자에게 설명하도록) */
export async function callTool(name: string, query: string, signal: AbortSignal): Promise<MessageTool> {
  const info = (await listTools()).find((t) => t.name === name);
  const base = { name, title: info?.title ?? name, emoji: info?.emoji ?? '🔧' };
  if (!info) return { ...base, result: '지금은 이 도구를 쓸 수 없습니다.', isError: true };
  try {
    const res = await withClient((c) =>
      c.callTool({ name, arguments: { query } }, undefined, {
        signal,
        timeout: config.toolTimeoutMs,
      }),
    );
    const text = (res.content as { type: string; text?: string }[])
      .filter((p) => p.type === 'text')
      .map((p) => p.text)
      .join('\n')
      .slice(0, 6000);
    return { ...base, result: text || '(결과 없음)', isError: res.isError === true };
  } catch (err) {
    if (signal.aborted) throw err;
    return { ...base, result: '도구 서버가 응답하지 않습니다. 잠시 후 다시 시도하세요.', isError: true };
  }
}

/** 모델에게 넘길 질문 — 도구 결과를 근거로 답하게 한다 */
export function withToolResult(question: string, tool: MessageTool): string {
  const guide = tool.isError
    ? '도구 실행이 실패했습니다. 실패 사실과 이유를 사용자에게 짧게 알리고, 도구 없이 답할 수 있는 부분만 답하세요.'
    : '위 도구 결과만 근거로 답하세요. 결과에 없는 내용은 지어내지 마세요.' +
      (tool.name === 'web_search' ? ' 참고한 결과는 [제목](주소) 형식의 링크로 출처를 붙이세요.' : '');
  return `[도구: ${tool.emoji} ${tool.title}]\n<도구 결과>\n${tool.result}\n</도구 결과>\n${guide}\n\n사용자 질문: ${question}`;
}
