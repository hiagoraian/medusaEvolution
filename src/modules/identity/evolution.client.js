import axios from 'axios';
import 'dotenv/config';

const BASE_URL = (process.env.EVOLUTION_URL ?? 'http://localhost:8081').replace(/\/+$/, '');

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    apikey: process.env.EVOLUTION_API_KEY ?? '',
    'Content-Type': 'application/json',
  },
  timeout: 15_000,
});

// URL que a Evolution API (dentro do Docker) usa para chamar nossa API (no host)
const WEBHOOK_URL =
  process.env.WEBHOOK_URL ?? 'http://host.docker.internal:3000/webhook/evolution';

const WEBHOOK_EVENTS = ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE'];

// ── Instâncias ────────────────────────────────────────────────────────────────

export async function createInstance(accountId, proxyConfig = null) {
  const body = {
    instanceName: accountId,
    integration: 'WHATSAPP-BAILEYS',
    webhook: {
      enabled: true,
      url: WEBHOOK_URL,
      byEvents: false,
      base64: false, // base64:true infla payloads de imagem/vídeo — QR code vem da resposta HTTP do /connect
      events: WEBHOOK_EVENTS,
    },
  };

  if (proxyConfig) body.proxy = proxyConfig;

  const { data } = await client.post('/instance/create', body);
  return data;
}

// Retorna 'open' | 'close' | 'connecting' | null
export async function fetchInstanceState(accountId) {
  try {
    const { data } = await client.get(`/instance/connectionState/${accountId}`);
    // Evolution v2 retorna { instance: { instanceName, state } }
    return data?.instance?.state ?? data?.state ?? null;
  } catch {
    return null;
  }
}

// Aciona reconexão e faz a Evolution emitir QRCODE_UPDATED via webhook
// Usar apenas quando sabemos que a instância existe mas não está conectada
export async function reconnectInstance(accountId) {
  const { data } = await client.get(`/instance/connect/${accountId}`);
  return data;
}

// Desconecta o WhatsApp mas mantém a instância na Evolution (pode reconectar depois)
export async function logoutInstance(accountId) {
  const { data } = await client.delete(`/instance/logout/${accountId}`);
  return data;
}

// Remove a instância permanentemente da Evolution API
export async function deleteInstance(accountId) {
  const { data } = await client.delete(`/instance/delete/${accountId}`);
  return data;
}

// ── Grupos ────────────────────────────────────────────────────────────────────

export async function fetchGroups(accountId) {
  const { data } = await client.get(`/group/fetchAllGroups/${accountId}?getParticipants=false`);
  return data;
}

// ── Mapa instanceName → ownerJid (ex: "5511999999999@s.whatsapp.net") ─────────
// Cache em módulo com TTL de 5 min para evitar hammering na Evolution API.

let _instancesCache = { map: {}, ts: 0 };
const CACHE_TTL_MS  = 5 * 60 * 1_000;

export async function fetchAllInstancesPhones() {
  if (Date.now() - _instancesCache.ts < CACHE_TTL_MS && Object.keys(_instancesCache.map).length) {
    return _instancesCache.map;
  }

  try {
    const { data } = await client.get('/instance/fetchInstances');
    const map = {};
    for (const entry of (Array.isArray(data) ? data : [])) {
      const name  = entry.instance?.instanceName ?? entry.instanceName;
      const owner = entry.instance?.owner        ?? entry.owner;
      if (name && owner) map[name] = owner;
    }
    _instancesCache = { map, ts: Date.now() };
    return map;
  } catch (err) {
    console.warn('[EVOLUTION] fetchAllInstancesPhones falhou:', err.message);
    return _instancesCache.map; // retorna stale se disponível
  }
}
