import 'dotenv/config';

// ── Helper ────────────────────────────────────────────────────────────────────

// Gera ["WA-01", "WA-02", ..., "WA-12"]
function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, i) => {
    const n = start + i;
    return `WA-${String(n).padStart(2, '0')}`;
  });
}

// ── Mapeamento de hardware ────────────────────────────────────────────────────
//
// Cada ZTE gerencia 6 instâncias WhatsApp.
//
//  ZTE1 → WA-01 … WA-06
//  ZTE2 → WA-07 … WA-12
//  ZTE3 → WA-13 … WA-18
//  ZTE4 → WA-19 … WA-24
//  ZTE5 → WA-25 … WA-30
//  ZTE6 → WA-31 … WA-36
//  ZTE7 → WA-37 … WA-42
//  ZTE8 → WA-43 … WA-48

export const ZTE_CONFIG = {
  ZTE1: {
    serial:   process.env.ZTE_1_SERIAL    ?? null,
    proxyUrl: process.env.ZTE_1_PROXY_URL ?? null,
    accounts: range(1, 6),
  },
  ZTE2: {
    serial:   process.env.ZTE_2_SERIAL    ?? null,
    proxyUrl: process.env.ZTE_2_PROXY_URL ?? null,
    accounts: range(7, 12),
  },
  ZTE3: {
    serial:   process.env.ZTE_3_SERIAL    ?? null,
    proxyUrl: process.env.ZTE_3_PROXY_URL ?? null,
    accounts: range(13, 18),
  },
  ZTE4: {
    serial:   process.env.ZTE_4_SERIAL    ?? null,
    proxyUrl: process.env.ZTE_4_PROXY_URL ?? null,
    accounts: range(19, 24),
  },
  ZTE5: {
    serial:   process.env.ZTE_5_SERIAL    ?? null,
    proxyUrl: process.env.ZTE_5_PROXY_URL ?? null,
    accounts: range(25, 30),
  },
  ZTE6: {
    serial:   process.env.ZTE_6_SERIAL    ?? null,
    proxyUrl: process.env.ZTE_6_PROXY_URL ?? null,
    accounts: range(31, 36),
  },
  ZTE7: {
    serial:   process.env.ZTE_7_SERIAL    ?? null,
    proxyUrl: process.env.ZTE_7_PROXY_URL ?? null,
    accounts: range(37, 42),
  },
  ZTE8: {
    serial:   process.env.ZTE_8_SERIAL    ?? null,
    proxyUrl: process.env.ZTE_8_PROXY_URL ?? null,
    accounts: range(43, 48),
  },
};

// ── Helpers de consulta ───────────────────────────────────────────────────────

export function getAllZteIds() {
  return Object.keys(ZTE_CONFIG);
}

// Retorna { zteId, serial, proxyUrl, accounts } ou null se a conta não tiver ZTE
export function getZteForAccount(accountId) {
  for (const [zteId, config] of Object.entries(ZTE_CONFIG)) {
    if (config.accounts.includes(accountId)) {
      return { zteId, ...config };
    }
  }
  return null;
}
