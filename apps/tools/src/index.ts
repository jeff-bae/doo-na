// doona-tools — 두나가 쓰는 가벼운 도구 모음 (MCP 서버, Streamable HTTP)
//   POST /mcp     MCP 요청 (stateless — 요청마다 새 서버 인스턴스)
//   GET  /health  상태 확인
import http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { ToolError } from './tool.js';
import { TOOLS } from './tools/index.js';

const PORT = Number(process.env.PORT ?? 4000);
const TOKEN = process.env.TOOLS_TOKEN;

function buildServer() {
  const server = new McpServer({ name: 'doona-tools', version: '0.1.0' });
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: { query: z.string().min(1).max(500).describe('사용자가 입력한 문장') },
        annotations: { readOnlyHint: true, openWorldHint: true },
        // 두나 화면용 정보
        _meta: { emoji: tool.emoji, placeholder: tool.placeholder },
      },
      async ({ query }, extra) => {
        const started = Date.now();
        try {
          const text = await tool.run(query, extra.signal);
          console.log(`[${tool.name}] ok ${Date.now() - started}ms "${query.slice(0, 60)}"`);
          return { content: [{ type: 'text', text }] };
        } catch (err) {
          const message = err instanceof ToolError ? err.message : '도구 실행 중 오류가 났습니다.';
          console.warn(`[${tool.name}] fail ${Date.now() - started}ms "${query.slice(0, 60)}": ${(err as Error).message}`);
          return { content: [{ type: 'text', text: message }], isError: true };
        }
      },
    );
  }
  return server;
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 256 * 1024) throw new Error('too large');
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
}

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, tools: TOOLS.map((t) => t.name) }));
  }
  if (url.pathname !== '/mcp') {
    res.writeHead(404).end();
    return;
  }
  if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) {
    res.writeHead(401).end();
    return;
  }
  if (req.method !== 'POST') {
    // stateless 모드라 SSE 세션(GET)과 세션 종료(DELETE)는 쓰지 않는다
    res.writeHead(405, { Allow: 'POST' }).end();
    return;
  }
  try {
    const body = await readJson(req);
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    console.error('mcp request failed', err);
    if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'application/json' }).end('{"error":"bad request"}');
  }
});

httpServer.listen(PORT, () => console.log(`doona-tools listening on :${PORT} (${TOOLS.map((t) => t.name).join(', ')})`));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.once(sig, () => httpServer.close(() => process.exit(0)));
