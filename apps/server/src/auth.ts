import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { User } from '@doona/shared';
import { config } from './config.js';
import { db } from './db.js';

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(key, expected);
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  is_admin: number;
  created_at: string;
}

export const toUser = (r: UserRow): User => ({
  id: r.id,
  username: r.username,
  isAdmin: r.is_admin === 1,
  createdAt: r.created_at,
});

export function findUserByName(username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
}

export async function createUser(username: string, password: string, isAdmin = false): Promise<User> {
  const hash = await hashPassword(password);
  const info = db
    .prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)')
    .run(username, hash, isAdmin ? 1 : 0);
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid) as UserRow;
  return toUser(row);
}

export async function setPassword(userId: number, password: string): Promise<void> {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(password), userId);
  // 비밀번호가 바뀌면 기존 세션은 모두 무효화
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function createSession(userId: number): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.sessionDays * 86_400_000).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    sha256(token),
    userId,
    expiresAt,
  );
  return { token, expiresAt };
}

export function deleteSession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

function userFromToken(token: string): User | null {
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(sha256(token), new Date().toISOString()) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function bearerToken(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: User;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const token = bearerToken(req);
  const user = token ? userFromToken(token) : null;
  if (!user) return reply.code(401).send({ error: '로그인이 필요합니다.' });
  req.user = user;
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  await requireAuth(req, reply);
  if (reply.sent) return;
  if (!req.user.isAdmin) return reply.code(403).send({ error: '관리자 권한이 필요합니다.' });
}

export function purgeExpiredSessions(): void {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
}

/** ADMIN_USERNAME/ADMIN_PASSWORD 가 있고 사용자가 한 명도 없으면 관리자 계정을 만든다. */
export async function bootstrapAdmin(log: { info: (m: string) => void; warn: (m: string) => void }) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  if (n > 0) return;
  if (config.adminUsername && config.adminPassword) {
    await createUser(config.adminUsername, config.adminPassword, true);
    log.info(`관리자 계정 생성: ${config.adminUsername}`);
  } else {
    log.warn('사용자가 없습니다. `npm run user -- add <이름> --admin` 또는 ADMIN_USERNAME/ADMIN_PASSWORD 로 관리자를 만드세요.');
  }
}
