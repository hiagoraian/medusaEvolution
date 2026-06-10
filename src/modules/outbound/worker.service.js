import { consumeQueue, publishMessage, QUEUES } from '../../core/rabbitmq.js';
import { isInstanceOnline, setInstanceOffline } from '../identity/cache.service.js';
import { sendText, sendMedia }                  from './evolution.outbound.client.js';
import { updateMessageStatus }     from '../pipeline/pipeline.repository.js';
import { incrementZapSent }        from '../reports/zap-stats.repository.js';
import { processSpintax }          from '../spintax/spintax.service.js';
import fs                          from 'fs';

const OFFLINE_REQUEUE_DELAY_MS   = 10_000;
const OFFLINE_MAX_RETRIES        = 6;   // ~1 min — após isso abandona e deixa como pendente no DB
const TRANSIENT_REQUEUE_DELAY_MS = 20_000;
const TRANSIENT_MAX_RETRIES      = 5;   // ~100s — após isso marca como erro e descarta
const MIN_SAFE_DELAY_MS          = 15_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Cache de mídia em memória com limite de 20 entradas (LRU simples).
// Quando cheio, remove a entrada mais antiga antes de adicionar nova.
const MEDIA_CACHE_MAX = 20;
const _mediaCache = new Map();

function getMediaBase64(filePath) {
  if (!filePath) return null;
  if (_mediaCache.has(filePath)) return _mediaCache.get(filePath);
  try {
    const b64 = fs.readFileSync(filePath).toString('base64');
    if (_mediaCache.size >= MEDIA_CACHE_MAX) {
      _mediaCache.delete(_mediaCache.keys().next().value);
    }
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

// Sorteia um texto do array e processa spintax. Retorna null se não há texto disponível.
function sortearTexto(task) {
  const { texts, text } = task;
  let chosen = null;
  if (Array.isArray(texts) && texts.length) {
    chosen = texts[Math.floor(Math.random() * texts.length)];
  } else {
    chosen = text ?? null;
  }
  return chosen ? processSpintax(chosen) : null;
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
      const retries = (task._offlineRetries ?? 0) + 1;

      if (retries >= OFFLINE_MAX_RETRIES) {
        console.warn(
          `[WORKER] "${accountId}" offline por ${retries} tentativas — abandonando msg +${phone}. ` +
          `Resetando para pendente no DB.`
        );
        ack();
        await reportStatus(id, 'pendente', phone);
        return;
      }

      console.warn(
        `[WORKER] Devolvendo msg para "${phone}" — "${accountId}" offline. ` +
        `Requeue em ${OFFLINE_REQUEUE_DELAY_MS / 1000}s (${retries}/${OFFLINE_MAX_RETRIES}).`
      );
      await sleep(OFFLINE_REQUEUE_DELAY_MS);
      ack();
      publishMessage(QUEUES.OUTBOUND, { ...task, _offlineRetries: retries });
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
          // Envia imagem sem legenda e texto separado (parece mais natural no WhatsApp)
          await sendMedia(accountId, phone, b64, mediaType, '');
          if (textoSorteado) {
            await sleep(2_000 + Math.floor(Math.random() * 3_000));
            await sendText(accountId, phone, textoSorteado);
          }
        } else if (textoSorteado) {
          console.warn(`[WORKER] Arquivo de mídia ausente para ${phone} — enviando apenas texto.`);
          await sendText(accountId, phone, textoSorteado);
        } else {
          console.error(
            `[WORKER] Mídia ausente E texto vazio para ${phone} (id=${id}) — descartando. ` +
            `texts=${JSON.stringify(task.texts)}, text=${JSON.stringify(task.text)}`
          );
          ack();
          await reportStatus(id, 'erro', phone);
          return;
        }
      } else if (type === 'media') {
        await sendMedia(accountId, phone, mediaUrl, mediaType, caption);
      } else {
        const textoSorteado = sortearTexto(task);
        if (!textoSorteado) {
          console.error(`[WORKER] Texto vazio para ${phone} (id=${id}) — descartando.`);
          ack();
          await reportStatus(id, 'erro', phone);
          return;
        }
        await sendText(accountId, phone, textoSorteado);
      }

      console.log(
        `[WORKER] ✓ Enviado para +${phone} via "${accountId}" | ` +
        `campanha: ${campaignId ?? 'teste'}`
      );

      ack();
      await reportStatus(id, 'enviado', phone);
      incrementZapSent(accountId).catch(() => {});

    } catch (err) {
      // ── Passo 4: Classificação da falha ──────────────────────────────────
      const httpStatus = err.response?.status;
      const errBody    = err.response?.data;
      const errMsg     = (
        typeof errBody === 'string' ? errBody : errBody?.message ?? err.message ?? ''
      ).toLowerCase();

      const isConnectionClosed = errMsg.includes('connection closed');

      const isInvalidNumber =
        !isConnectionClosed &&
        (httpStatus === 400 && (
          errMsg.includes('invalid') ||
          errMsg.includes('not exists') ||
          errMsg.includes('does not exist') ||
          errMsg.includes('no exists') ||
          errMsg.includes('not registered')
        ));

      // Connection Closed = instância morreu em voo — marca offline e recoloca na fila
      if (isConnectionClosed) {
        console.warn(
          `[WORKER] "${accountId}" Connection Closed para +${phone} — marcando offline e devolvendo msg.`
        );
        await setInstanceOffline(accountId).catch(() => {});
        nack(true);
        return;
      }

      const isPermanent = httpStatus === 400;

      if (isPermanent) {
        const label = isInvalidNumber ? 'Número inválido' : 'Erro 400';
        console.warn(
          `[WORKER] ${label} (${phone}) — descartando. ` +
          `HTTP: ${httpStatus} | corpo: ${JSON.stringify(errBody)?.slice(0, 200)}`
        );
        ack();
        await reportStatus(id, 'invalido', phone);
      } else {
        const retries = (task._transitoryRetries ?? 0) + 1;
        if (retries >= TRANSIENT_MAX_RETRIES) {
          console.error(
            `[WORKER] Falha transitória para +${phone} via "${accountId}" — ${retries}ª tentativa, abandonando. ` +
            `HTTP: ${httpStatus ?? err.code ?? 'N/A'} | ${errMsg}`
          );
          ack();
          await reportStatus(id, 'erro', phone);
        } else {
          console.error(
            `[WORKER] Falha transitória para +${phone} via "${accountId}". ` +
            `HTTP: ${httpStatus ?? err.code ?? 'N/A'} | ${errMsg} — requeue (${retries}/${TRANSIENT_MAX_RETRIES}).`
          );
          ack();
          await sleep(TRANSIENT_REQUEUE_DELAY_MS);
          publishMessage(QUEUES.OUTBOUND, { ...task, _transitoryRetries: retries });
        }
      }
    }
  });

  console.log('[WORKER] Outbound worker aguardando mensagens na fila outbound_queue...');
}
