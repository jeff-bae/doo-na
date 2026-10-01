import type { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * 실제 사용자 IP.
 * Cloudflare Tunnel 뒤에서는 CF-Connecting-IP 를 쓴다 (Cloudflare가 매 요청 덮어쓰므로 위조 불가).
 * 서버 포트는 127.0.0.1 에만 열려 있어 Cloudflare/Tailscale 을 거치지 않은 외부 요청은 들어올 수 없다.
 */
export function clientIp(req: FastifyRequest): string {
  const cf = req.headers['cf-connecting-ip'];
  return (typeof cf === 'string' && cf) || req.ip;
}

/** 고정 창(window) 방식의 간단한 메모리 속도 제한기 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private limit: number,
    private windowMs: number,
  ) {
    setInterval(() => this.sweep(), windowMs).unref();
  }

  /** 한 번 기록하고, 한도를 넘었으면 남은 대기 시간(ms)을 돌려준다. 통과면 0 */
  hit(key: string): number {
    const t = Date.now();
    const h = this.hits.get(key);
    if (!h || h.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      return 0;
    }
    h.count++;
    return h.count > this.limit ? h.resetAt - t : 0;
  }

  /** 기록 없이 현재 차단 여부만 확인 */
  blocked(key: string): number {
    const h = this.hits.get(key);
    const t = Date.now();
    return h && h.resetAt > t && h.count >= this.limit ? h.resetAt - t : 0;
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  private sweep() {
    const t = Date.now();
    for (const [k, h] of this.hits) if (h.resetAt <= t) this.hits.delete(k);
  }
}

export const minutes = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // React 인라인 style 속성 사용
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

/** 모든 응답에 보안 헤더 추가 */
export function securityHeaders(app: FastifyInstance) {
  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    if (req.headers['x-forwarded-proto'] === 'https' || req.headers['cf-visitor']?.includes('https')) {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    const type = String(reply.getHeader('content-type') ?? '');
    if (type.startsWith('text/html')) reply.header('Content-Security-Policy', CSP);
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', reply.getHeader('cache-control') ?? 'no-store');
    return payload;
  });
}
