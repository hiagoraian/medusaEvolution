import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { connectPostgres, initSchema } from '../core/postgres.js';
import { connectRedis }                from '../core/redis.js';
import { connectRabbitMQ }             from '../core/rabbitmq.js';

import identityRoutes from '../modules/identity/identity.routes.js';
import webhookRoutes  from '../modules/identity/webhook.routes.js';
import outboundRoutes from '../modules/outbound/outbound.routes.js';
import { startOutboundWorkers } from '../modules/outbound/worker.service.js';
import pipelineRoutes from '../modules/pipeline/pipeline.routes.js';
import { createPipelineSchema } from '../modules/pipeline/pipeline.repository.js';
import networkRoutes       from '../modules/network/network.routes.js';
import orchestratorRoutes  from '../modules/orchestrator/orchestrator.routes.js';
import { startInboundWorker } from '../modules/inbound/inbound.worker.js';
import inboundRoutes          from '../modules/inbound/inbound.routes.js';
import { startWarmupWorker }  from '../modules/warmup/warmup.worker.js';
import { startWarmupCron }    from '../modules/warmup/warmup.cron.js';
import warmupRoutes           from '../modules/warmup/warmup.routes.js';
import { createWarmupSchema } from '../modules/warmup/warmup.repository.js';
import reportsRoutes          from '../modules/reports/reports.routes.js';
import mediaRoutes            from '../modules/media/media.routes.js';

const app  = express();
const PORT = process.env.PORT ?? 3000;

// ── Middlewares (antes das rotas) ─────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: 100 * 1024 * 1024 })); // 100 MB

// ── Rotas ─────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

app.use('/api/whatsapp',       identityRoutes);  // POST /api/whatsapp/start
                                                  // GET  /api/whatsapp/qrcode/:accountId
app.use('/webhook/evolution',  webhookRoutes);    // POST /webhook/evolution
app.use('/api/campaign',       outboundRoutes);   // POST /api/campaign/test-shoot
app.use('/api/pipeline',       pipelineRoutes);   // POST /api/pipeline/upload
app.use('/api/network',        networkRoutes);    // GET  /api/network/status
                                                  // POST /api/network/rotate/:zteId
app.use('/api/orchestrator',   orchestratorRoutes); // POST /api/orchestrator/start
                                                    // POST /api/orchestrator/stop
                                                    // GET  /api/orchestrator/status
app.use('/api/inbound',        inboundRoutes);      // GET  /api/inbound/groups/:accountId
app.use('/api/warmup',         warmupRoutes);       // GET  /api/warmup/config
                                                    // POST /api/warmup/config
app.use('/api/reports',        reportsRoutes);
app.use('/api/media',         mediaRoutes);        // POST /api/media/upload      // GET  /api/reports/dashboard

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function withRetry(fn, label, maxAttempts = 12, delayMs = 5_000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fn();
      return;
    } catch (err) {
      console.warn(`[BOOT] ${label} — tentativa ${attempt}/${maxAttempts}: ${err.message}`);
      if (attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function bootstrap() {
  console.log('[BOOT] ══════════════════════════════════════');
  console.log('[BOOT]  MedusaEvolution — iniciando serviços');
  console.log('[BOOT] ══════════════════════════════════════');

  await withRetry(connectRedis,    'Redis',    12, 3_000);
  await withRetry(connectPostgres, 'Postgres', 12, 5_000);
  await initSchema();
  await createPipelineSchema();
  await createWarmupSchema();
  await withRetry(connectRabbitMQ, 'RabbitMQ', 12, 5_000);

  // Workers iniciam após o canal RabbitMQ estar pronto
  await startOutboundWorkers();
  await startInboundWorker();
  await startWarmupWorker();
  startWarmupCron(); // não-bloqueante: agenda o primeiro tick e retorna

  app.listen(PORT, () => {
    console.log('[BOOT] ══════════════════════════════════════');
    console.log(`[SERVER] Servidor HTTP na porta ${PORT}`);
    console.log(`[SERVER] POST /api/whatsapp/start`);
    console.log(`[SERVER] GET  /api/whatsapp/qrcode/:accountId`);
    console.log(`[SERVER] POST /webhook/evolution`);
    console.log(`[SERVER] POST /api/campaign/test-shoot`);
    console.log(`[SERVER] POST /api/pipeline/upload`);
    console.log(`[SERVER] GET  /api/network/status`);
    console.log(`[SERVER] POST /api/network/rotate/:zteId`);
    console.log(`[SERVER] POST /api/orchestrator/start`);
    console.log(`[SERVER] POST /api/orchestrator/stop`);
    console.log(`[SERVER] GET  /api/orchestrator/status`);
    console.log(`[SERVER] GET  /api/inbound/groups/:accountId`);
    console.log(`[SERVER] GET  /api/reports/dashboard`);
    console.log('[BOOT] Sistema pronto.');
    console.log('[BOOT] ══════════════════════════════════════');
  });
}

bootstrap().catch((err) => {
  console.error('[BOOT] Falha crítica na inicialização:', err.message);
  process.exit(1);
});
