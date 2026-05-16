import { consumeQueue }            from '../../core/rabbitmq.js';
import { isInstanceOnline }        from '../identity/cache.service.js';
import { sendText, sendMedia }     from './evolution.outbound.client.js';
import { updateMessageStatus }     from '../pipeline/pipeline.repository.js';
import fs                          from 'fs';

const OFFLINE_REQUEUE_DELAY_MS = 10_000;
const MIN_SAFE_DELAY_MS        = 15_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Cache de mídia em memória — lê o arquivo do disco apenas uma vez por processo.
// Chave: filePath absoluto → Valor: base64 string
const _mediaCache = new Map();

function getMediaBase64(filePath) {
  if (!filePath) return null;
  if (_mediaCache.has(filePath)) return _mediaCache.get(filePath);
  try {
    const b64 = fs.readFileSync(filePath).toString('base64');
    _mediaCache.set(filePath, b64);
    console.log(`[WORKER] Mídia carregada em cache: ${filePath} (${(b64.length / 1024).toFixed(0)} KB base64)`);
    return b64;
  } catch (err) {
    console.error(`[WORKER] Falha ao ler mídia "${filePath}":`, err.message);
    return null;
  }
}

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
      type          = 'text',
      mediaUrl,
      mediaType,
      mediaFilePath, // campanha com mídia local (cache em memória)
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
      if (type === 'media_text') {
        const textoSorteado = sortearTexto(task);
        const b64 = getMediaBase64(mediaFilePath);
        if (b64) {
          await sendMedia(accountId, phone, b64, mediaType, textoSorteado);
        } else {
          console.warn(`[WORKER] Arquivo de mídia ausente para ${phone} — enviando apenas texto.`);
          await sendText(accountId, phone, textoSorteado);
        }
      } else if (type === 'media') {
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
