import { query } from '../../core/postgres.js';

export async function createZapStatsSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS zap_stats (
      account_id  VARCHAR(20)  PRIMARY KEY,
      total_sent  INTEGER      NOT NULL DEFAULT 0,
      updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  console.log('[ZAP-STATS] Schema pronto.');
}

// Incrementa o contador de um ZAP atomicamente
export async function incrementZapSent(accountId) {
  await query(
    `INSERT INTO zap_stats (account_id, total_sent, updated_at)
     VALUES ($1, 1, NOW())
     ON CONFLICT (account_id)
     DO UPDATE SET total_sent  = zap_stats.total_sent + 1,
                   updated_at  = NOW()`,
    [accountId]
  );
}

// Retorna todos os ZAPs com seus totais (0 para quem nunca enviou)
export async function getAllZapStats(accountIds) {
  const { rows } = await query(
    `SELECT account_id, total_sent, updated_at
     FROM   zap_stats
     WHERE  account_id = ANY($1::varchar[])`,
    [accountIds]
  );

  const map = Object.fromEntries(rows.map((r) => [r.account_id, r]));

  return accountIds.map((id) => ({
    accountId: id,
    totalSent: map[id]?.total_sent  ?? 0,
    updatedAt: map[id]?.updated_at  ?? null,
  }));
}

// Zera o contador de um ZAP (chip banido / substituído)
export async function resetZapStats(accountId) {
  await query(
    `INSERT INTO zap_stats (account_id, total_sent, updated_at)
     VALUES ($1, 0, NOW())
     ON CONFLICT (account_id)
     DO UPDATE SET total_sent = 0, updated_at = NOW()`,
    [accountId]
  );
}
