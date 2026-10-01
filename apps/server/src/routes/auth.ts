import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { LoginResponse } from '@doona/shared';
import crypto from 'node:crypto';
import {
  bearerToken,
  hashPassword,
  createSession,
  deleteSession,
  findUserByName,
  requireAuth,
  setPassword,
  toUser,
  verifyPassword,
} from '../auth.js';
import { db } from '../db.js';
import { RateLimiter, clientIp, minutes } from '../security.js';

const loginSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(200),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, '비밀번호는 8자 이상이어야 합니다.').max(200),
});

// 로그인 무차별 대입 방지
//  - IP당 10분에 10회 시도
//  - 아이디당 15분에 10회 실패하면 잠금 (IP를 바꿔 가며 시도하는 공격 대비)
//    잠금은 메모리에만 있으므로 급하면 서버 재시작으로 풀 수 있다
const ipLimiter = new RateLimiter(10, 10 * 60_000);
const userLockout = new RateLimiter(10, 15 * 60_000);

// 없는 아이디도 같은 시간이 걸리게 해서 아이디 존재 여부를 숨긴다
const DUMMY_HASH = await hashPassword(crypto.randomUUID());

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req, reply) => {
    const ip = clientIp(req);
    const ipWait = ipLimiter.hit(ip);
    if (ipWait) {
      return reply
        .code(429)
        .send({ error: `로그인 시도가 너무 많습니다. ${minutes(ipWait)}분 후 다시 시도하세요.` });
    }
    const body = loginSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: '아이디와 비밀번호를 입력하세요.' });

    const key = body.data.username.toLowerCase();
    const lockWait = userLockout.blocked(key);
    if (lockWait) {
      return reply
        .code(429)
        .send({ error: `로그인 실패가 반복되어 계정이 잠겼습니다. ${minutes(lockWait)}분 후 다시 시도하세요.` });
    }

    const row = findUserByName(body.data.username);
    const ok = await verifyPassword(body.data.password, row?.password_hash ?? DUMMY_HASH);
    if (!row || !ok) {
      userLockout.hit(key);
      req.log.warn({ ip, username: key }, 'login failed');
      return reply.code(401).send({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }
    ipLimiter.reset(ip);
    userLockout.reset(key);
    const session = createSession(row.id);
    const res: LoginResponse = { token: session.token, expiresAt: session.expiresAt, user: toUser(row) };
    return res;
  });

  app.post('/api/auth/logout', { preHandler: requireAuth }, async (req, reply) => {
    deleteSession(bearerToken(req)!);
    return reply.code(204).send();
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (req) => req.user);

  app.post('/api/auth/password', { preHandler: requireAuth }, async (req, reply) => {
    const body = passwordSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? '입력값 오류' });
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id) as {
      password_hash: string;
    };
    if (!(await verifyPassword(body.data.currentPassword, row.password_hash))) {
      return reply.code(400).send({ error: '현재 비밀번호가 올바르지 않습니다.' });
    }
    await setPassword(req.user.id, body.data.newPassword);
    const session = createSession(req.user.id);
    return { token: session.token, expiresAt: session.expiresAt, user: req.user } satisfies LoginResponse;
  });
}
