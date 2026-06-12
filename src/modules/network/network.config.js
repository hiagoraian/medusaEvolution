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
//  ZTE1 → WA-01 … WA-07  (7 ZAPs)
//  ZTE2 → WA-08 … WA-14  (7 ZAPs)
//  ZTE3 → WA-15 … WA-21  (7 ZAPs)
//  ZTE4 → WA-22 … WA-28  (7 ZAPs)
//  ZTE5 → WA-29 … WA-35  (7 ZAPs)
//  ZTE6 → WA-36 … WA-42  (7 ZAPs)
//  ZTE7 → WA-43 … WA-48  (6 ZAPs)

export const ZTE_CONFIG = {
  ZTE1: { proxyUrl: process.env.ZTE_1_PROXY_URL ?? null, accounts: range(1,  7)  },
  ZTE2: { proxyUrl: process.env.ZTE_2_PROXY_URL ?? null, accounts: range(8,  14) },
  ZTE3: { proxyUrl: process.env.ZTE_3_PROXY_URL ?? null, accounts: range(15, 21) },
  ZTE4: { proxyUrl: process.env.ZTE_4_PROXY_URL ?? null, accounts: range(22, 28) },
  ZTE5: { proxyUrl: process.env.ZTE_5_PROXY_URL ?? null, accounts: range(29, 35) },
  ZTE6: { proxyUrl: process.env.ZTE_6_PROXY_URL ?? null, accounts: range(36, 42) },
  ZTE7: { proxyUrl: process.env.ZTE_7_PROXY_URL ?? null, accounts: range(43, 48) },
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
