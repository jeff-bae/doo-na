import type { FastifyInstance } from 'fastify';
import type { HealthResponse, PersonasResponse } from '@doona/shared';
import { requireAuth, requireAdmin } from '../auth.js';
import { config } from '../config.js';
import { modelGate } from '../modelGate.js';
import { ping } from '../ollama.js';
import { PERSONAS, getPersona, publicPersona } from '../personas.js';
import { listTools } from '../tools.js';

export async function systemRoutes(app: FastifyInstance) {
  app.get('/api/health', async (): Promise<HealthResponse> => {
    const ollama = await ping();
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
