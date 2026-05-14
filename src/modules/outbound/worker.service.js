import { consumeQueue }            from '../../core/rabbitmq.js';
import { isInstanceOnline }        from '../identity/cache.service.js';
import { sendText, sendMedia }     from './evolution.outbound.client.js';
import { updateMessageStatus }     from '../pipeline/pipeline.repository.js';

const OFFLINE_REQUEUE_DELAY_MS = 10_000; // pausa antes de requeue quando instância está offline
const MIN_SAFE_DELAY_MS        = 15_000; // freio de mão: delay mínimo mesmo sem cálculo

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Atualiza o DB sem bloquear o fluxo principal — falha aqui é não-crítica.
async function reportStatus(id, status, phone) {
  if (!id) return;
  try {
    await updateMessageStatus(id, status);
  } catch (err) {
    console.error(`[WORKER] Falha ao gravar status "${status}" para ${phone} (id=${id}):`, err.message);
  }
}

// Sorteia um texto do array. Fallback para text legado (mensagens de teste).
function sortearTexto(task) {
  const { texts, text } = task;
  if (Array.isArray(texts) && texts.length) {
    return texts[Math.floor(Math.random() * texts.length)];
  }
  return text ?? '';
}

export async function startOutboundWorkers() {
  await consumeQueue('outbound_queue', async (task, { ack, nack }) => {
    const {
      id,
      accountId,
      phone,
      type        = 'text',
      mediaUrl,
      mediaType,
      caption,
      campaignId,
      delayFlexivelMs,  // calculado pelo orquestrador — undefined em msgs de teste
    } = task;

    // ── Passo 1: Checagem de instância (Redis, zero I/O na Evolution) ────────
    const online = await isInstanceOnline(accountId);
    if (!online) {
      console.warn(
        `[WORKER] Devolvendo msg para "${phone}" — "${accountId}" offline. ` +
        `Requeue em ${OFFLINE_REQUEUE_DELAY_MS / 1000}s.`
      );
      await sleep(OFFLINE_REQUEUE_DELAY_MS);
      nack(true);
      return;
    }

    // ── Passo 2: Freio de mão (cadenciamento matemático) ─────────────────────
    // O orquestrador calculou delayFlexivelMs com base em totalPending e durationHours.
    // Aqui executamos esse tempo de espera — ele distribui as mensagens uniformemente
    // ao longo das horas programadas sem precisar de rate limiter externo.
    const delay = delayFlexivelMs != null
      ? Math.max(delayFlexivelMs, MIN_SAFE_DELAY_MS)
      : 0; // msgs de teste (test-shoot) não têm delay

    if (delay > 0) {
      console.log(
        `[WORKER] Aguardando ${(delay / 1000).toFixed(1)}s antes de enviar para ${phone} ` +
        `(cadenciamento — campanha: ${campaignId ?? 'teste'})`
      );
      await sleep(delay);
    }

    // ── Passo 3: Envio via Evolution API ──────────────────────────────────────
    try {
      if (type === 'media') {
        await sendMedia(accountId, phone, mediaUrl, mediaType, caption);
      } else {
        const textoSorteado = sortearTexto(task);
        await sendText(accountId, phone, textoSorteado);
      }

      console.log(
        `[WORKER] ✓ Enviado para +${phone} via "${accountId}" | ` +
        `campanha: ${campaignId ?? 'teste'}`
      );

      ack();
      await reportStatus(id, 'enviado', phone);

    } catch (err) {
      // ── Passo 4: Classificação da falha ──────────────────────────────────
      const httpStatus = err.response?.status;
      const errBody    = err.response?.data;
      const errMsg     = (
        typeof errBody === 'string' ? errBody : errBody?.message ?? err.message ?? ''
      ).toLowerCase();

      const isPermanent =
        httpStatus === 400         ||
        errMsg.includes('invalid') ||
        errMsg.includes('not exists') ||
        errMsg.includes('does not exist');

      if (isPermanent) {
        console.warn(
          `[WORKER] Número inválido (${phone}) — descartando. ` +
          `HTTP: ${httpStatus ?? 'N/A'} | ${errMsg}`
        );
        ack();
        await reportStatus(id, 'invalido', phone);
      } else {
        console.error(
          `[WORKER] Falha transitória para +${phone} via "${accountId}". ` +
          `HTTP: ${httpStatus ?? err.code ?? 'N/A'} | ${errMsg} — requeue.`
        );
        nack(true);
      }
    }
  });

  console.log('[WORKER] Outbound worker aguardando mensagens na fila outbound_queue...');
}
