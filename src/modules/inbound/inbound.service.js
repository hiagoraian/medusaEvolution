import 'dotenv/config';
import {
  sendText,
  sendMedia,
  sendWhatsAppAudio,
} from '../outbound/evolution.outbound.client.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildHeader(phone, pushName, instance) {
  const nameDisplay = pushName ? ` (${pushName})` : '';
  return (
    `📩 *Nova Mensagem*\n` +
    `*De:* +${phone}${nameDisplay}\n` +
    `*Zap:* ${instance}\n` +
    `---\n`
  );
}

function extractBase64(msgObj) {
  // Evolution API v2 embeds base64 in the message sub-object
  return (
    msgObj?.base64                        ??
    msgObj?.imageMessage?.jpegThumbnail   ??
    null
  );
}

// ── Roteador de tipos de mensagem ─────────────────────────────────────────────

export async function forwardToAdminGroup(incomingMsg) {
  const adminZap = process.env.ADMIN_ZAP      ?? 'WA-49';
  const groupJid = process.env.ADMIN_GROUP_JID;

  if (!groupJid) throw new Error('ADMIN_GROUP_JID não configurado no .env.');

  const { instance, pushName, messageType, message = {} } = incomingMsg;
  const phone = incomingMsg.key?.remoteJid?.split('@')[0] ?? incomingMsg.phone ?? '?';

  const header = buildHeader(phone, pushName, instance);

  switch (messageType) {

    // ── Tipos de sistema — descarta silenciosamente ─────────────────────────
    case 'templateMessage':
    case 'protocolMessage':
    case 'ephemeralMessage':
    case 'buttonsMessage':
    case 'listMessage':
    case 'orderMessage':
    case 'productMessage':
      return;

    // ── Texto simples / com formatação ──────────────────────────────────────
    case 'conversation':
    case 'extendedTextMessage': {
      const text =
        message.conversation                   ??
        message.extendedTextMessage?.text      ??
        '[Mensagem sem texto]';

      console.log(`[INBOUND] sendText → zap=${adminZap} | group=${groupJid} | textLen=${(header + text).length}`);
      await sendText(adminZap, groupJid, header + text);
      break;
    }

    // ── Reação (emoji em mensagem anterior) ─────────────────────────────────
    case 'reactionMessage': {
      const emoji   = message.reactionMessage?.text ?? '❓';
      const payload = `⭐ *Reação Recebida*\n*De:* +${phone}${pushName ? ` (${pushName})` : ''}\n*Zap:* ${instance}\n---\n${emoji}`;
      await sendText(adminZap, groupJid, payload);
      break;
    }

    // ── Imagem ───────────────────────────────────────────────────────────────
    case 'imageMessage': {
      const base64  = message.imageMessage?.base64 ?? extractBase64(message);
      const caption = header + (message.imageMessage?.caption ?? '');

      if (base64) {
        await sendMedia(adminZap, groupJid, base64, 'image', caption);
      } else {
        await sendText(adminZap, groupJid, header + '[📷 Imagem recebida — sem prévia]');
      }
      break;
    }

    // ── Vídeo ────────────────────────────────────────────────────────────────
    case 'videoMessage': {
      const base64  = message.videoMessage?.base64 ?? extractBase64(message);
      const caption = header + (message.videoMessage?.caption ?? '');

      if (base64) {
        await sendMedia(adminZap, groupJid, base64, 'video', caption);
      } else {
        await sendText(adminZap, groupJid, header + '[🎥 Vídeo recebido — sem prévia]');
      }
      break;
    }

    // ── Áudio PTT (push-to-talk) ──────────────────────────────────────────
    case 'audioMessage': {
      const base64 = message.audioMessage?.base64 ?? extractBase64(message);

      await sendText(adminZap, groupJid, header + '[🎤 Áudio recebido]');

      if (base64) {
        await sendWhatsAppAudio(adminZap, groupJid, base64);
      }
      break;
    }

    // ── Sticker ───────────────────────────────────────────────────────────
    case 'stickerMessage': {
      const base64 = message.stickerMessage?.base64 ?? extractBase64(message);

      await sendText(adminZap, groupJid, header + '[🖼️ Sticker recebido]');

      if (base64) {
        await sendMedia(adminZap, groupJid, base64, 'sticker', '');
      }
      break;
    }

    // ── Documento ─────────────────────────────────────────────────────────
    case 'documentMessage': {
      const base64    = message.documentMessage?.base64 ?? extractBase64(message);
      const fileName  = message.documentMessage?.fileName ?? 'documento';
      const caption   = header + `[📄 Documento: ${fileName}]`;

      if (base64) {
        await sendMedia(adminZap, groupJid, base64, 'document', caption);
      } else {
        await sendText(adminZap, groupJid, caption);
      }
      break;
    }

    // ── Localização ───────────────────────────────────────────────────────
    case 'locationMessage': {
      const lat  = message.locationMessage?.degreesLatitude  ?? '?';
      const lng  = message.locationMessage?.degreesLongitude ?? '?';
      await sendText(
        adminZap, groupJid,
        header + `[📍 Localização: ${lat}, ${lng}]`
      );
      break;
    }

    // ── Tipo desconhecido ─────────────────────────────────────────────────
    default: {
      await sendText(
        adminZap, groupJid,
        header + `[⚠️ Tipo de mensagem não suportado: ${messageType ?? 'desconhecido'}]`
      );
    }
  }
}
