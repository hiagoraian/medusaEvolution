import { consumeQueue }                          from '../../core/rabbitmq.js';
import { sendText, sendMedia, sendWhatsAppAudio } from '../outbound/evolution.outbound.client.js';
import { QUEUES }                                 from '../../core/rabbitmq.js';

// Delay humano: 10–25 s (mais conservador que o antigo 5-15 s)
const MIN_DELAY_MS = 10_000;
const MAX_DELAY_MS = 25_000;

const sleep      = (ms) => new Promise((r) => setTimeout(r, ms));
const humanDelay = () => MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));

async function processTask(task, ack, nack) {
  const { accountId, type, target, text, base64, caption } = task;

  if (!accountId || !target) {
    console.warn('[WARMUP] Tarefa inválida (sem accountId ou target) — descartando.');
    ack();
    return;
  }

  const delay = humanDelay() + (task.extraDelayMs ?? 0);
  const label = task.extraDelayMs ? 'REPLY' : type?.toUpperCase();
  console.log(`[WARMUP] Aguardando ${(delay / 1000).toFixed(1)}s antes de enviar ${label} via ${accountId}...`);
  await sleep(delay);

  switch (type) {
    case 'text':
      await sendText(accountId, target, text ?? 'Oi!');
      break;

    case 'image':
      if (!base64) throw new Error('base64 ausente para tipo image');
      await sendMedia(accountId, target, base64, 'image', caption ?? '');
      break;

    case 'audio':
      if (!base64) throw new Error('base64 ausente para tipo audio');
      await sendWhatsAppAudio(accountId, target, base64);
      break;

    default:
      console.warn(`[WARMUP] Tipo desconhecido "${type}" — descartando.`);
      ack();
      return;
  }

  ack();
  console.log(`[WARMUP] ✓ Enviado [${type?.toUpperCase()}] via ${accountId} → ${target}`);
}

export async function startWarmupWorker() {
  await consumeQueue(QUEUES.WARMUP, async (task, { ack, nack }) => {
    const { accountId = '?', type = '?', target = '?' } = task;
    try {
      await processTask(task, ack, nack);
    } catch (err) {
      const isInvalid   = err.response?.status >= 400 && err.response?.status < 500;
      const isTransient = err.response?.status >= 500 || !err.response;

      if (isInvalid) {
        console.error(`[WARMUP] ✗ Falha permanente [${type}] via ${accountId} → ${target}:`, err.message, '— descartando.');
        ack();
      } else if (isTransient) {
        console.error(`[WARMUP] ✗ Falha transiente [${type}] via ${accountId} → ${target}:`, err.message, '— requeue.');
        nack(true);
      } else {
        console.error(`[WARMUP] ✗ Erro inesperado [${type}] via ${accountId}:`, err.message, '— DLQ.');
        nack(false);
      }
    }
  });

  console.log('[WARMUP] Worker aguardando tarefas na fila warmup_queue...');
}
