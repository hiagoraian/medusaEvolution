import {
  saveConnectData,
  deleteConnectData,
  setInstanceOnline,
  setInstanceOffline,
  isInstanceOnline,
} from './cache.service.js';
import { publishMessage, QUEUES } from '../../core/rabbitmq.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectMediaType(message = {}) {
  if (message.imageMessage)    return 'imagem';
  if (message.videoMessage)    return 'vídeo';
  if (message.audioMessage)    return 'áudio';
  if (message.documentMessage) return 'documento';
  if (message.stickerMessage)  return 'sticker';
  if (message.locationMessage) return 'localização';
  return null;
}

function extractText(message = {}) {
  return (
    message.conversation                    ??
    message.extendedTextMessage?.text       ??
    message.imageMessage?.caption           ??
    message.videoMessage?.caption           ??
    message.documentMessage?.caption        ??
    null
  );
}

// ── Handler principal ─────────────────────────────────────────────────────────

// POST /webhook/evolution
export async function handleEvolutionWebhook(req, res) {
  // REGRA #1: Responde imediatamente — a Evolution API não pode ficar esperando
  res.sendStatus(200);

  const body      = req.body;
  const rawEvent  = body?.event ?? '';
  const eventType = rawEvent.toUpperCase().replace(/\./g, '_');
  const instance  = body?.instance;

  if (!eventType || !instance) return;

  try {
    switch (eventType) {

      // ── QR Code ────────────────────────────────────────────────────────────
      case 'QRCODE_UPDATED': {
        const qrcode      = body?.data?.qrcode ?? body?.data ?? {};
        const base64      = qrcode?.base64;
        const pairingCode = qrcode?.pairingCode ?? null;

        if (!base64) {
          console.warn(`[DEBUG] QRCODE_UPDATED sem base64 para "${instance}". Payload: ${JSON.stringify(body?.data).slice(0,200)}`);
          break;
        }

        await saveConnectData(instance, { base64, pairingCode });
        console.log(`[DEBUG] QR Code salvo no Redis — instância: ${instance}`);
        break;
      }

      // ── Estado de conexão ──────────────────────────────────────────────────
      case 'CONNECTION_UPDATE': {
        const state = body?.data?.state ?? body?.data?.connection;

        if (state === 'open') {
          const alreadyOnline = await isInstanceOnline(instance);
          if (!alreadyOnline) {
            await setInstanceOnline(instance);
            await deleteConnectData(instance);
            console.log(`[WEBHOOK] Instância CONECTADA: ${instance}`);
          }
        } else if (state === 'close') {
          const alreadyOnline = await isInstanceOnline(instance);
          if (alreadyOnline) {
            await setInstanceOffline(instance);
            await deleteConnectData(instance);
            console.log(`[WEBHOOK] Instância DESCONECTADA: ${instance}`);
          }
        }
        break;
      }

      // ── Mensagens recebidas → inbound_queue ────────────────────────────────
      case 'MESSAGES_UPSERT': {
        const rawData = body?.data;
        const msgs    = Array.isArray(rawData) ? rawData : [rawData];

        for (const msg of msgs) {
          if (!msg) continue;

          const key       = msg.key ?? {};
          const remoteJid = key.remoteJid ?? '';

          // ── Filtros ────────────────────────────────────────────────────────
          if (key.fromMe)                             continue;
          if (remoteJid.endsWith('@g.us'))            continue;
          if (remoteJid.endsWith('@broadcast'))       continue;
          if (remoteJid.endsWith('@newsletter'))      continue;
          if (!remoteJid.endsWith('@s.whatsapp.net')) continue;

          const message     = msg.message ?? {};
          const messageType = Object.keys(message)[0] ?? 'unknown';

          // Payload completo — inbound.service extrai o que precisar
          publishMessage(QUEUES.INBOUND, {
            instance,
            key,
            pushName:    msg.pushName    ?? null,
            messageType,
            message,
            receivedAt:  new Date().toISOString(),
          });

          console.log(
            `[WEBHOOK] MESSAGES_UPSERT [${messageType}] de ${remoteJid} via "${instance}" → inbound_queue`
          );
        }
        break;
      }

      // ── Atualizações de status de entrega — apenas loga ───────────────────
      case 'MESSAGES_UPDATE':
        // Confirmações de leitura/entrega — não precisam de ação aqui
        break;

      default:
        console.log(`[WEBHOOK] Evento "${eventType}" / "${instance}" ignorado.`);
    }
  } catch (err) {
    console.error(`[WEBHOOK] Erro ao processar "${eventType}" / "${instance}":`, err.message);
  }
}
