import { createClient } from 'redis';
import 'dotenv/config';

const client = createClient({
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('[REDIS] Máximo de tentativas de reconexão atingido.');
        return new Error('Redis: max reconnect attempts reached');
      }
      const delay = Math.min(retries * 500, 5_000);
      console.warn(`[REDIS] Reconectando... tentativa ${retries} (aguardando ${delay}ms)`);
      return delay;
    },
  },
});

client.on('error', (err) => console.error('[REDIS] Erro:', err.message));
client.on('ready', () => console.log('[REDIS] Conectado com sucesso.'));

export async function connectRedis() {
  await client.connect();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export async function getCache(key) {
  try {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error(`[REDIS] Erro ao ler "${key}":`, err.message);
    return null;
  }
}

export async function setCache(key, value, ttl_seconds) {
  try {
    const serialized = JSON.stringify(value);
    if (ttl_seconds) {
      await client.setEx(key, ttl_seconds, serialized);
    } else {
      await client.set(key, serialized);
    }
  } catch (err) {
    console.error(`[REDIS] Erro ao gravar "${key}":`, err.message);
  }
}

export async function delCache(key) {
  try {
    await client.del(key);
  } catch (err) {
    console.error(`[REDIS] Erro ao deletar "${key}":`, err.message);
  }
}

export { client as redisClient };
