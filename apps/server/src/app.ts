import fs from 'node:fs';
import path from 'node:path';
import Fastify, { LogController } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { conversationRoutes } from './routes/conversations.js';
import { systemRoutes } from './routes/system.js';
import { securityHeaders } from './security.js';

// Tauri 앱(Windows)의 WebView 출처 — 항상 허용
const TAURI_ORIGINS = ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'];

export async function buildApp() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    // 같은 머신/도커 네트워크의 프록시(cloudflared, tailscale serve)만 신뢰
    trustProxy: 'loopback,uniquelocal',
    // 운영 환경에서는 요청마다 로그를 남기지 않는다 (오류는 그대로 기록)
    logController: new LogController({ disableRequestLogging: process.env.NODE_ENV === 'production' }),
    bodyLimit: 1024 * 1024,
  });

  securityHeaders(app);

  await app.register(cors, {
    origin: [...TAURI_ORIGINS, ...config.corsOrigins],
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  });

  await app.register(authRoutes);
  await app.register(adminRoutes);
  await app.register(systemRoutes);
  await app.register(conversationRoutes);

  // 빌드된 웹(PWA)을 같은 출처로 제공
  const hasWeb = fs.existsSync(path.join(config.webDist, 'index.html'));
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not Found' });
    // SPA: 알 수 없는 경로는 index.html
    if (req.method === 'GET' && hasWeb) return reply.sendFile('index.html');
    return reply.code(404).send({ error: 'Not Found' });
  });

  if (hasWeb) {
    await app.register(fastifyStatic, {
      root: config.webDist,
      setHeaders(res, filePath) {
        const name = path.basename(filePath);
        // 서비스워커/매니페스트/index.html은 항상 최신본을 받게 한다
        if (name === 'sw.js' || name === 'index.html' || name.endsWith('.webmanifest') || name === 'theme-init.js') {
          // no-store: Cloudflare가 브라우저 캐시 TTL로 덮어쓰거나 엣지에 캐시하지 않게 한다
          res.header('Cache-Control', 'no-store, must-revalidate');
          res.header('CDN-Cache-Control', 'no-store');
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.header('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    });
  } else {
    app.log.warn(`웹 빌드가 없습니다 (${config.webDist}). API만 제공합니다.`);
  }

  return app;
}
