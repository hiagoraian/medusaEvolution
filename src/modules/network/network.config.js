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
// Cada ZTE gerencia 12 instâncias WhatsApp.
// WA-49 (administrador do Inbound) não pertence a nenhum ZTE — é a conta de saída protegida.
//
//  ZTE1 → WA-01 … WA-12   (grupo A)
//  ZTE2 → WA-13 … WA-24   (grupo B)
//  ZTE3 → WA-25 … WA-36   (grupo C)
//  ZTE4 → WA-37 … WA-48   (grupo D)

export const ZTE_CONFIG = {
  ZTE1: {
    serial:   process.env.ZTE_1_SERIAL   ?? null,
    proxyUrl: process.env.ZTE_1_PROXY_URL ?? null, // ex: http://localhost:5001
    accounts: range(1, 12),
  },
  ZTE2: {
    serial:   process.env.ZTE_2_SERIAL   ?? null,
    proxyUrl: process.env.ZTE_2_PROXY_URL ?? null,
    accounts: range(13, 24),
  },
  ZTE3: {
    serial:   process.env.ZTE_3_SERIAL   ?? null,
    proxyUrl: process.env.ZTE_3_PROXY_URL ?? null,
    accounts: range(25, 36),
  },
  ZTE4: {
    serial:   process.env.ZTE_4_SERIAL   ?? null,
    proxyUrl: process.env.ZTE_4_PROXY_URL ?? null,
    accounts: range(37, 48),
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
