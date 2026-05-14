import net from 'net';
import { getZteForAccount } from '../network/network.config.js';

// ── Proxy determinístico via ZTE_CONFIG ───────────────────────────────────────
// WA-01..12 → ZTE1_PROXY_URL  |  WA-13..24 → ZTE2_PROXY_URL  |  etc.
// Lógica centralizada em network.config.js — proxy.service só consome.

export function getProxyForInstance(accountId) {
  const zte = getZteForAccount(accountId);
  return zte?.proxyUrl ?? null;
}

// ── Teste de disponibilidade via TCP ──────────────────────────────────────────

export function isProxyAlive(proxyUrl, timeoutMs = 2_500) {
  return new Promise((resolve) => {
    let url;
    try { url = new URL(proxyUrl); } catch { return resolve(false); }

    const host = url.hostname;
    const port = parseInt(url.port, 10);
    if (!host || !port) return resolve(false);

    const socket = net.createConnection({ host, port });
    const timer  = setTimeout(() => { socket.destroy(); resolve(false); }, timeoutMs);

    socket.on('connect', () => { clearTimeout(timer); socket.destroy(); resolve(true); });
    socket.on('error',   () => { clearTimeout(timer); resolve(false); });
  });
}

// ── Monta o objeto proxy no formato da Evolution API v2 ──────────────────────

export function buildProxyConfig(proxyUrl) {
  try {
    const url = new URL(proxyUrl);
    return {
      host:     url.hostname,
      port:     url.port,
      protocol: url.protocol.replace(':', ''),
    };
  } catch {
    return null;
  }
}

// ── Resolve proxy ativo com fallback automático para Wi-Fi ────────────────────

export async function resolveProxy(accountId) {
  const proxyUrl = getProxyForInstance(accountId);
  if (!proxyUrl) return null;

  const alive = await isProxyAlive(proxyUrl);

  if (alive) {
    console.log(`[PROXY] ${accountId} → ${proxyUrl} (ativo)`);
    return buildProxyConfig(proxyUrl);
  }

  console.warn(`[PROXY] ${proxyUrl} indisponível para ${accountId} — usando Wi-Fi direto.`);
  return null;
}
