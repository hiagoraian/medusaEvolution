import axios from 'axios';
import 'dotenv/config';

const client = axios.create({
  baseURL: process.env.EVOLUTION_URL ?? 'http://localhost:8081',
  headers: {
    apikey: process.env.EVOLUTION_API_KEY ?? '',
    'Content-Type': 'application/json',
  },
  timeout: 30_000,
});

const MIME_MAP = {
  image:    'image/jpeg',
  video:    'video/mp4',
  audio:    'audio/mpeg',
  document: 'application/pdf',
  sticker:  'image/webp',
};

// ── Envio de mensagens ────────────────────────────────────────────────────────

export async function sendText(instanceName, number, text) {
  const { data } = await client.post(`/message/sendText/${instanceName}`, {
    number,
    text,
  });
  return data;
}

// media: URL pública ou base64 string
export async function sendMedia(instanceName, number, media, mediaType, caption = '') {
  const { data } = await client.post(`/message/sendMedia/${instanceName}`, {
    number,
    mediatype: mediaType,
    mimetype:  MIME_MAP[mediaType] ?? 'application/octet-stream',
    media,
    caption,
  });
  return data;
}

// Áudio PTT (push-to-talk) — encoding:true converte para opus/ogg no servidor
export async function sendWhatsAppAudio(instanceName, number, audioBase64) {
  const { data } = await client.post(`/message/sendWhatsAppAudio/${instanceName}`, {
    number,
    audio:    audioBase64,
    encoding: true,
  });
  return data;
}

// ── Grupos ────────────────────────────────────────────────────────────────────

export async function fetchGroups(instanceName) {
  const { data } = await client.get(
    `/group/fetchAllGroups/${instanceName}?getParticipants=false`
  );
  return data;
}
