import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { User } from '@doona/shared';
import { createUser, findUserByName, requireAdmin, setPassword, toUser } from '../auth.js';
import { db } from '../db.js';

const createSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[\w.\-가-힣]{2,30}$/, '아이디는 2~30자의 한글/영문/숫자/._- 만 가능합니다.'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다.').max(200),
  isAdmin: z.boolean().optional(),
});

const resetSchema = z.object({ password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다.').max(200) });

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAdmin);

  app.get('/api/admin/users', async () => {
    const rows = db.prepare('SELECT * FROM users ORDER BY id').all() as Parameters<typeof toUser>[0][];
    return rows.map(toUser);
  });

  app.post('/api/admin/users', async (req, reply) => {
    const body = createSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? '입력값 오류' });
    if (findUserByName(body.data.username)) return reply.code(409).send({ error: '이미 있는 아이디입니다.' });
    const user: User = await createUser(body.data.username, body.data.password, body.data.isAdmin);
    return reply.code(201).send(user);
  });

  app.post<{ Params: { id: string } }>('/api/admin/users/:id/password', async (req, reply) => {
    const body = resetSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? '입력값 오류' });
    const id = Number(req.params.id);
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)) return reply.code(404).send({ error: '사용자 없음' });
    await setPassword(id, body.data.password);
    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string } }>('/api/admin/users/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (id === req.user.id) return reply.code(400).send({ error: '자기 자신은 삭제할 수 없습니다.' });
    const info = db.prepare('DELETE FROM users WHERE id = ?').run(id);
    if (info.changes === 0) return reply.code(404).send({ error: '사용자 없음' });
    return reply.code(204).send();
  });
}
