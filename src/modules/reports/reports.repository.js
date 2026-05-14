import { query } from '../../core/postgres.js';

// ── Histórico de campanhas ────────────────────────────────────────────────────

export async function getCampaignsHistory() {
  const { rows } = await query(`
    SELECT
      c.id,
      c.enabled,
      c.created_at,
      COUNT(*)                                                          AS total,
      COUNT(*) FILTER (WHERE mq.status IN ('enviado', 'invalido'))     AS total_enviados,
      COUNT(*) FILTER (WHERE mq.status = 'invalido')                   AS total_invalidos,
      COUNT(*) FILTER (WHERE mq.status = 'falha_tecnica')              AS total_falhas,
      COUNT(*) FILTER (WHERE mq.status IN ('pendente', 'enfileirado')) AS total_pendentes
    FROM      campaigns c
    LEFT JOIN messages_queue mq ON mq.campaign_id = c.id
    GROUP BY  c.id, c.enabled, c.created_at
    HAVING    COUNT(*) FILTER (WHERE mq.status != 'importado') > 0
    ORDER BY  c.created_at DESC
  `);

  return rows.map((r) => ({
    id:            r.id,
    enabled:       r.enabled,
    createdAt:     r.created_at,
    total:         parseInt(r.total,          10),
    totalEnviados: parseInt(r.total_enviados, 10),
    totalInvalidos:parseInt(r.total_invalidos,10),
    totalFalhas:   parseInt(r.total_falhas,   10),
    totalPendentes:parseInt(r.total_pendentes,10),
  }));
}

// ── Exportação de contatos por status ─────────────────────────────────────────

const ALLOWED_STATUSES = new Set(['pendente','enfileirado','enviado','invalido','falha_tecnica']);

export async function exportContacts(campaignId, status) {
  if (!ALLOWED_STATUSES.has(status)) throw new Error(`Status inválido: ${status}`);

  const { rows } = await query(
    `SELECT phone FROM messages_queue WHERE campaign_id = $1 AND status = $2`,
    [campaignId, status]
  );

  return rows.map((r) => r.phone);
}

// ── Dashboard ao vivo ─────────────────────────────────────────────────────────

// Uma única query com FILTER para evitar múltiplas round-trips ao banco.
// A subquery da campanha ativa retorna o campaign_id mais recente com pendentes.
export async function getDashboardStats() {
  const result = await query(`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('enviado', 'invalido'))       AS total_enviados,
      COUNT(*) FILTER (WHERE status IN ('pendente', 'enfileirado'))   AS total_pendentes,
      COUNT(*) FILTER (WHERE status = 'falha_tecnica')                AS total_falhas,
      (
        SELECT campaign_id
        FROM   messages_queue
        WHERE  status = 'pendente'
        ORDER  BY id ASC
        LIMIT  1
      ) AS campanha_ativa
    FROM messages_queue
  `);

  const row = result.rows[0] ?? {};

  return {
    totalEnviados:  parseInt(row.total_enviados  ?? '0', 10),
    totalPendentes: parseInt(row.total_pendentes ?? '0', 10),
    totalFalhas:    parseInt(row.total_falhas    ?? '0', 10),
    campanhaAtiva:  row.campanha_ativa ?? null,
  };
}
