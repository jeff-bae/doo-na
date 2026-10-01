import type { FastifyInstance } from 'fastify';
import type { HealthResponse, PersonasResponse } from '@doona/shared';
import { requireAuth, requireAdmin } from '../auth.js';
import { config } from '../config.js';
import { modelGate } from '../modelGate.js';
import { ping } from '../llm.js';
import { PERSONAS, endpoints, getPersona, publicPersona } from '../personas.js';
import { listTools } from '../tools.js';

export async function systemRoutes(app: FastifyInstance) {
  app.get('/api/health', async (): Promise<HealthResponse> => {
    // 캐릭터들이 쓰는 LLM 서버가 모두 응답해야 정상
    const ollama = (await Promise.all(endpoints().map(ping))).every(Boolean);
    return { ok: true, ollama, model: getPersona(config.defaultPersona).model };
  });

  app.get('/api/personas', { preHandler: requireAuth }, async (): Promise<PersonasResponse> => ({
    default: getPersona(config.defaultPersona).id,
    personas: PERSONAS.map(publicPersona),
  }));

  app.get('/api/tools', { preHandler: requireAuth }, async () => listTools());

  // 운영 확인용: 큰 모델 교체 상태
  app.get('/api/admin/gate', { preHandler: requireAdmin }, async () => modelGate.status());
}
