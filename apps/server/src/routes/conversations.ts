import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Conversation, ConversationDetail, Message, MessageTool, PersonaId, StreamEvent } from '@doona/shared';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import { buildContext } from '../context.js';
import { db, now } from '../db.js';
import { GateTimeoutError, modelGate } from '../modelGate.js';
import { streamChat, type StreamResult } from '../ollama.js';
import { getPersona, isPersonaId, systemPromptFor } from '../personas.js';
import { callTool, listTools, withToolResult } from '../tools.js';
import { RateLimiter } from '../security.js';

const DEFAULT_TITLE = '새 대화';

interface ConversationRow {
  id: string;
  user_id: number;
  title: string;
  persona: string | null;
  model: string;
  created_at: string;
  updated_at: string;
}
interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  persona: string | null;
  tool_json: string | null;
  incomplete: number;
  created_at: string;
}

function parseTool(json: string | null): MessageTool | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as MessageTool;
  } catch {
    return null;
  }
}

const toConversation = (r: ConversationRow): Conversation => ({
  id: r.id,
  title: r.title,
  persona: getPersona(r.persona).id,
  model: r.model,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  conversationId: r.conversation_id,
  role: r.role,
  content: r.content,
  persona: r.role === 'assistant' && isPersonaId(r.persona) ? r.persona : null,
  tool: r.role === 'user' ? parseTool(r.tool_json) : null,
  incomplete: r.incomplete === 1,
  createdAt: r.created_at,
});

const personaSchema = z.custom<PersonaId>(isPersonaId, '알 수 없는 대화 상대입니다.');
const createSchema = z.object({ persona: personaSchema.optional(), title: z.string().trim().max(100).optional() });
const patchSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  persona: personaSchema.optional(),
});
const sendSchema = z.object({
  content: z.string().max(100_000).default(''),
  regenerate: z.boolean().optional(),
  editFrom: z.string().optional(),
  tool: z.string().max(64).optional(),
});

function getOwned(id: string, userId: number): ConversationRow | undefined {
  return db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(id, userId) as
    | ConversationRow
    | undefined;
}

function getMessages(conversationId: string): MessageRow[] {
  return db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid')
    .all(conversationId) as MessageRow[];
}

function insertMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  incomplete = false,
  persona: PersonaId | null = null,
): Message {
  const row: MessageRow = {
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    role,
    content,
    persona,
    tool_json: null,
    incomplete: incomplete ? 1 : 0,
    created_at: now(),
  };
  db.prepare(
    'INSERT INTO messages (id, conversation_id, role, content, persona, incomplete, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(row.id, row.conversation_id, row.role, row.content, row.persona, row.incomplete, row.created_at);
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(row.created_at, conversationId);
  return toMessage(row);
}

function makeTitle(content: string): string {
  const line = content.trim().split('\n')[0]!.replace(/\s+/g, ' ');
  return line.length > 40 ? `${line.slice(0, 40)}…` : line || DEFAULT_TITLE;
}

function notFound(reply: FastifyReply) {
  return reply.code(404).send({ error: '대화를 찾을 수 없습니다.' });
}

/** 현재 답변을 생성 중인 대화 — 같은 대화에 동시 요청을 막는다. */
const generating = new Set<string>();
/** 사용자별 동시 생성 수 — 한 계정이 AI 서버를 독점하지 못하게 */
const activeByUser = new Map<number, number>();
const MAX_ACTIVE_PER_USER = 2;
/** 사용자별 질문 횟수 제한 */
const messageLimiter = new RateLimiter(config.messagesPerMinute, 60_000);

export async function conversationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get<{ Querystring: { q?: string } }>('/api/conversations', async (req) => {
    const q = req.query.q?.trim();
    const rows = q
      ? (db
          .prepare(
            `SELECT c.* FROM conversations c
             WHERE c.user_id = @userId AND (c.title LIKE @pattern ESCAPE '\\' OR EXISTS (
               SELECT 1 FROM messages m
               WHERE m.conversation_id = c.id AND m.content LIKE @pattern ESCAPE '\\'))
             ORDER BY c.updated_at DESC`,
          )
          .all({ userId: req.user.id, pattern: `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%` }) as ConversationRow[])
      : (db
          .prepare('SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC')
          .all(req.user.id) as ConversationRow[]);
    return rows.map(toConversation);
  });

  app.post('/api/conversations', async (req, reply) => {
    const body = createSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: '입력값 오류' });
    const persona = getPersona(body.data.persona ?? config.defaultPersona);
    const t = now();
    const row: ConversationRow = {
      id: crypto.randomUUID(),
      user_id: req.user.id,
      title: body.data.title || DEFAULT_TITLE,
      persona: persona.id,
      model: persona.model,
      created_at: t,
      updated_at: t,
    };
    db.prepare(
      'INSERT INTO conversations (id, user_id, title, persona, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(row.id, row.user_id, row.title, row.persona, row.model, row.created_at, row.updated_at);
    return reply.code(201).send(toConversation(row));
  });

  app.get<{ Params: { id: string } }>('/api/conversations/:id', async (req, reply) => {
    const c = getOwned(req.params.id, req.user.id);
    if (!c) return notFound(reply);
    const detail: ConversationDetail = { ...toConversation(c), messages: getMessages(c.id).map(toMessage) };
    return detail;
  });

  app.patch<{ Params: { id: string } }>('/api/conversations/:id', async (req, reply) => {
    const c = getOwned(req.params.id, req.user.id);
    if (!c) return notFound(reply);
    const body = patchSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? '입력값 오류' });
    const persona = getPersona(body.data.persona ?? c.persona);
    db.prepare('UPDATE conversations SET title = ?, persona = ?, model = ? WHERE id = ?').run(
      body.data.title ?? c.title,
      persona.id,
      persona.model,
      c.id,
    );
    return toConversation(getOwned(c.id, req.user.id)!);
  });

  app.delete<{ Params: { id: string } }>('/api/conversations/:id', async (req, reply) => {
    const info = db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    if (info.changes === 0) return notFound(reply);
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string }; Querystring: { format?: string } }>(
    '/api/conversations/:id/export',
    async (req, reply) => {
      const c = getOwned(req.params.id, req.user.id);
      if (!c) return notFound(reply);
      const messages = getMessages(c.id).map(toMessage);
      if (req.query.format === 'json') return { ...toConversation(c), messages };
      const md = [
        `# ${c.title}`,
        '',
        `> 대화 상대: ${getPersona(c.persona).name} · 생성: ${c.created_at}`,
        '',
        ...messages.map((m) => {
          const who = m.role === 'user' ? '🙋 질문' : `${getPersona(m.persona ?? c.persona).emoji} ${getPersona(m.persona ?? c.persona).name}`;
          return `## ${who}\n\n${m.content}\n`;
        }),
      ].join('\n');
      return reply.type('text/markdown; charset=utf-8').send(md);
    },
  );

  app.post<{ Params: { id: string } }>('/api/conversations/:id/messages', async (req, reply) => {
    const c = getOwned(req.params.id, req.user.id);
    if (!c) return notFound(reply);
    const body = sendSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: '입력값 오류' });
    const { content, regenerate, editFrom, tool } = body.data;
    if (!regenerate && !content.trim()) return reply.code(400).send({ error: '질문을 입력하세요.' });
    if (generating.has(c.id)) return reply.code(409).send({ error: '이 대화는 이미 답변을 생성하고 있습니다.' });
    const toolInfo = tool && !regenerate ? (await listTools()).find((t) => t.name === tool) : undefined;
    if (tool && !regenerate && !toolInfo) {
      return reply.code(400).send({ error: '지금은 이 도구를 쓸 수 없습니다. 잠시 후 다시 시도하세요.' });
    }
    if ((activeByUser.get(req.user.id) ?? 0) >= MAX_ACTIVE_PER_USER) {
      return reply.code(429).send({ error: '동시에 생성할 수 있는 답변 수를 넘었습니다. 진행 중인 답변이 끝난 뒤 시도하세요.' });
    }
    if (messageLimiter.hit(String(req.user.id))) {
      return reply.code(429).send({ error: '질문이 너무 잦습니다. 잠시 후 다시 시도하세요.' });
    }

    // --- 대화 기록 정리 (다시 생성 / 질문 수정) ---
    let userMessage: Message | null = null;
    let title = c.title;
    const prepare = db.transaction(() => {
      const history = getMessages(c.id);
      if (regenerate) {
        const last = history.at(-1);
        if (last?.role === 'assistant') db.prepare('DELETE FROM messages WHERE id = ?').run(last.id);
        if (!history.some((m) => m.role === 'user')) throw new Error('다시 생성할 질문이 없습니다.');
        return;
      }
      if (editFrom) {
        const idx = history.findIndex((m) => m.id === editFrom && m.role === 'user');
        if (idx < 0) throw new Error('수정할 질문을 찾을 수 없습니다.');
        const del = db.prepare('DELETE FROM messages WHERE id = ?');
        for (const m of history.slice(idx)) del.run(m.id);
      }
      userMessage = insertMessage(c.id, 'user', content);
      if (c.title === DEFAULT_TITLE) {
        title = makeTitle(content);
        db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(title, c.id);
      }
    });
    try {
      prepare();
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }

    // 캐릭터가 대화의 모델과 말투를 정한다 (환경 변수로 모델을 바꿨다면 여기서 따라감)
    const persona = getPersona(c.persona);
    const model = persona.model;
    if (model !== c.model) db.prepare('UPDATE conversations SET model = ? WHERE id = ?').run(model, c.id);


    // --- SSE 스트리밍 ---
    generating.add(c.id);
    activeByUser.set(req.user.id, (activeByUser.get(req.user.id) ?? 0) + 1);
    const abort = new AbortController();
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      ...(reply.getHeaders() as Record<string, string>),
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (e: StreamEvent) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(e)}\n\n`);
    };
    res.on('close', () => {
      if (!res.writableFinished) abort.abort();
    });
    // 모델 로딩 등으로 첫 토큰이 늦을 때 연결 유지
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);

    send({ type: 'start', userMessage, title });
    let answer = '';
    const result: StreamResult = {};
    let release = () => {};
    try {
      // 도구를 골랐으면 먼저 실행하고, 결과를 질문에 붙여 둔다 (다시 생성할 때 재사용)
      if (toolInfo && userMessage) {
        const um = userMessage as Message;
        send({ type: 'status', message: `${toolInfo.emoji} ${toolInfo.title} 중이에요…` });
        const toolResult = await callTool(toolInfo.name, content, abort.signal);
        db.prepare('UPDATE messages SET tool_json = ? WHERE id = ?').run(JSON.stringify(toolResult), um.id);
        send({ type: 'tool', messageId: um.id, tool: toolResult });
        if (toolResult.isError) req.log.warn({ tool: toolInfo.name, result: toolResult.result }, 'tool failed');
      }
      const context = buildContext(
        getMessages(c.id).map((m) => {
          const used = m.role === 'user' ? parseTool(m.tool_json) : null;
          return { role: m.role, content: used ? withToolResult(m.content, used) : m.content };
        }),
        systemPromptFor(persona),
      );

      // 큰 모델끼리는 메모리에 하나만 — 다른 큰 모델이 답변 중이면 끝날 때까지 기다렸다가 교체
      release = await modelGate.acquire(model, abort.signal, config.gateWaitMs, () =>
        send({
          type: 'status',
          message: `${persona.emoji} ${persona.name}을 깨우는 중이에요. 다른 두나가 답변을 마치면 바로 시작해요…`,
        }),
      );
      for await (const piece of streamChat(model, context, abort.signal, result, persona.keepAlive)) {
        answer += piece;
        send({ type: 'delta', content: piece });
      }
      if (abort.signal.aborted) {
        if (answer) insertMessage(c.id, 'assistant', answer, true, persona.id);
      } else {
        // 최대 길이에 걸려 잘린 답변은 '중단됨'으로 표시
        const truncated = result.doneReason === 'length';
        if (truncated) req.log.warn({ conversationId: c.id, model }, 'answer hit MAX_TOKENS');
        send({ type: 'done', message: insertMessage(c.id, 'assistant', answer, truncated, persona.id) });
      }
    } catch (err) {
      if (abort.signal.aborted && !(err instanceof GateTimeoutError)) {
        // 기다리는 중에 사용자가 중지함
      } else {
        if (!(err instanceof GateTimeoutError)) req.log.error(err, 'ollama stream failed');
        const partial = answer ? insertMessage(c.id, 'assistant', answer, true, persona.id) : undefined;
        send({ type: 'error', error: (err as Error).message, message: partial });
      }
    } finally {
      release();
      clearInterval(heartbeat);
      generating.delete(c.id);
      const n = (activeByUser.get(req.user.id) ?? 1) - 1;
      if (n > 0) activeByUser.set(req.user.id, n);
      else activeByUser.delete(req.user.id);
      res.end();
    }
  });
}
