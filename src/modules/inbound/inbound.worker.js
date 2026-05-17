import { consumeQueue }              from '../../core/rabbitmq.js';
import { forwardToAdminGroup }        from './inbound.service.js';
import { fetchAllInstancesPhones }    from '../identity/evolution.client.js';

// Rate limit: 4 s de pausa ANTES do ack — prefetch(1) bloqueia a próxima entrega
// durante o delay, garantindo ≤ 15 msgs/min sem contador externo.
const RATE_LIMIT_MS = 4_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function isOwnFleetJid(remoteJid) {
  try {
    const map = await fetchAllInstancesPhones();
    return Object.values(map).includes(remoteJid);
  } catch {
    return false; // fail-open: nunca descarta mensagem de cliente real por erro
  }
}

export async function startInboundWorker() {
  await consumeQueue('inbound_queue', async (msg, { ack, nack }) => {
    const remoteJid   = msg.key?.remoteJid ?? '';
    const phone       = remoteJid.split('@')[0] || msg.phone || '?';
    const instance    = msg.instance ?? '?';
    const messageType = msg.messageType ?? 'unknown';

    try {
      // Descarta mensagens de aquecimento (ping-pong entre ZAPs da frota)
      if (await isOwnFleetJid(remoteJid)) {
        console.log(`[INBOUND] Warmup ignorado — ${remoteJid} é da própria frota.`);
        ack();
        return;
      }

      console.log(`[INBOUND] Encaminhando ${messageType.toUpperCase()} de +${phone} via ${instance}`);

      await forwardToAdminGroup(msg);

      await sleep(RATE_LIMIT_MS);
      ack();

      console.log(`[INBOUND] ✓ Encaminhado — +${phone} via ${instance} [${messageType}]`);
    } catch (err) {
      const httpStatus = err.response?.status;

      // Erros permanentes (4xx): descarta — requeue causaria loop infinito.
      // Causas comuns: ADMIN_GROUP_JID inválido, tipo de mensagem não suportado.
      if (httpStatus >= 400 && httpStatus < 500) {
        const body = err.response?.data;
        console.warn(
          `[INBOUND] ✗ Erro permanente (${httpStatus}) para ${messageType} de +${phone} — descartando. ` +
          `Corpo: ${JSON.stringify(body)?.slice(0, 300)}`
        );
        ack();
        return;
      }

      // Erros transientes (5xx / rede): envia para DLQ sem requeue imediato.
      console.error(
        `[INBOUND] ✗ Falha ao encaminhar ${messageType} de +${phone} via ${instance}:`,
        err.message,
        '— DLQ.'
      );
      nack(false);
    }
  });

  console.log('[INBOUND] Worker aguardando mensagens na fila inbound_queue...');
}
