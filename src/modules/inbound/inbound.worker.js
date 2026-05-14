import { consumeQueue }        from '../../core/rabbitmq.js';
import { forwardToAdminGroup } from './inbound.service.js';

// Rate limit: 4 s de pausa ANTES do ack — prefetch(1) bloqueia a próxima entrega
// durante o delay, garantindo ≤ 15 msgs/min sem contador externo.
const RATE_LIMIT_MS = 4_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startInboundWorker() {
  await consumeQueue('inbound_queue', async (msg, { ack, nack }) => {
    const phone       = msg.key?.remoteJid?.split('@')[0] ?? msg.phone ?? '?';
    const instance    = msg.instance ?? '?';
    const messageType = msg.messageType ?? 'unknown';

    try {
      console.log(`[INBOUND] Encaminhando ${messageType.toUpperCase()} de +${phone} via ${instance}`);

      await forwardToAdminGroup(msg);

      await sleep(RATE_LIMIT_MS);
      ack();

      console.log(`[INBOUND] ✓ Encaminhado — +${phone} via ${instance} [${messageType}]`);
    } catch (err) {
      console.error(
        `[INBOUND] ✗ Falha ao encaminhar ${messageType} de +${phone} via ${instance}:`,
        err.message,
        '— requeue.'
      );
      nack(true);
    }
  });

  console.log('[INBOUND] Worker aguardando mensagens na fila inbound_queue...');
}
