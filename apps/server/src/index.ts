import { bootstrapAdmin, purgeExpiredSessions } from './auth.js';
import { buildApp } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
import { modelGate } from './modelGate.js';
import { ping } from './llm.js';
import { PERSONAS, getPersona } from './personas.js';

const app = await buildApp();
await bootstrapAdmin(app.log);
purgeExpiredSessions();
setInterval(purgeExpiredSessions, 6 * 3_600_000).unref();

await app.listen({ host: config.host, port: config.port });
for (const p of PERSONAS) {
  const ok = await ping(p.endpoint);
  app.log.info(`${p.emoji} ${p.name}: ${p.model} @ ${p.endpoint.kind} ${p.endpoint.url} — ${ok ? '연결됨' : '연결 실패'}`);
}
await modelGate.init(getPersona(config.defaultPersona).model, app.log);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, async () => {
    await app.close();
    db.close();
    process.exit(0);
  });
}
