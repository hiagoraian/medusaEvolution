import { getCache, setCache, delCache } from '../../core/redis.js';

const QR_TTL = 120; // segundos — QR codes expiram em 2 minutos

// ── QR Code / Pairing Code ────────────────────────────────────────────────────

export function saveConnectData(accountId, data) {
  return setCache(`qr:${accountId}`, data, QR_TTL);
}

export function getConnectData(accountId) {
  return getCache(`qr:${accountId}`);
}

export function deleteConnectData(accountId) {
  return delCache(`qr:${accountId}`);
}

// ── Status de conexão ─────────────────────────────────────────────────────────

export function setInstanceOnline(accountId) {
  // Sem TTL — a instância fica "online" até um evento de close chegar
  return setCache(`status:${accountId}`, 'open');
}

export function setInstanceOffline(accountId) {
  return setCache(`status:${accountId}`, 'close');
}

export async function isInstanceOnline(accountId) {
  const status = await getCache(`status:${accountId}`);
  return status === 'open';
}

// Varre todas as chaves status:* e retorna [{id, online}]
export async function listInstanceStatuses() {
  const { redisClient } = await import('../../core/redis.js');
  const keys = await redisClient.keys('status:*');
  if (!keys.length) return [];

  const values = await redisClient.mGet(keys);
  return keys.map((key, i) => ({
    id:     key.replace('status:', ''),
    online: values[i] === '"open"' || values[i] === 'open',
  }));
}
