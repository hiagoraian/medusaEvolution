import { query, pool } from '../../core/postgres.js';

// ── Schema ────────────────────────────────────────────────────────────────────

export async function createPipelineSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS messages_queue (
      id          SERIAL       PRIMARY KEY,
      campaign_id VARCHAR(100) NOT NULL,
      phone       VARCHAR(50)  NOT NULL,
      status      VARCHAR(20)  NOT NULL DEFAULT 'pendente',
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_mq_campaign_status
      ON messages_queue (campaign_id, status);
  `);

  // Metadados das listas (enabled para controle no painel)
  await query(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id         VARCHAR(100) PRIMARY KEY,
      enabled    BOOLEAN      NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `);

  console.log('[PIPELINE] Schema messages_queue + campaigns pronto.');
}

// ── Inserção em lote ──────────────────────────────────────────────────────────

const BATCH_SIZE = 10_000;

export async function bulkInsertContacts(campaignId, phonesArray) {
  if (!phonesArray.length) return 0;

  // Registra a campanha na tabela de metadados (idempotente)
  await query(
    `INSERT INTO campaigns (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
    [campaignId]
  );

  let inserted = 0;
  for (let i = 0; i < phonesArray.length; i += BATCH_SIZE) {
    const batch  = phonesArray.slice(i, i + BATCH_SIZE);
    const result = await query(
      `INSERT INTO messages_queue (campaign_id, phone, status)
       SELECT $1, UNNEST($2::text[]), 'importado'`,
      [campaignId, batch]
    );
    inserted += result.rowCount ?? 0;
  }

  return inserted;
}

// ── Listagem de campanhas (painel) ────────────────────────────────────────────

// LEFT JOIN com messages_queue garante que listas uploadadas antes da campaigns
// table existir ainda apareçam (enabled=true por COALESCE).
export async function getLists() {
  const { rows } = await query(`
    SELECT
      mq.campaign_id                                                   AS id,
      COALESCE(c.enabled, true)                                        AS enabled,
      COALESCE(c.created_at, MIN(mq.created_at))                       AS created_at,
      COUNT(*)                                                         AS total,
      COUNT(*) FILTER (WHERE mq.status IN ('importado', 'pendente'))   AS pendentes,
      COUNT(*) FILTER (WHERE mq.status IN ('enviado', 'invalido'))     AS processados,
      COUNT(*) FILTER (WHERE mq.status = 'enfileirado')                AS enfileirados,
      COUNT(*) FILTER (WHERE mq.status = 'falha_tecnica')              AS falhas
    FROM   messages_queue mq
    LEFT   JOIN campaigns c ON c.id = mq.campaign_id
    GROUP  BY mq.campaign_id, c.enabled, c.created_at
    ORDER  BY COALESCE(c.created_at, MIN(mq.created_at)) DESC
  `);

  return rows.map((r) => ({
    id:          r.id,
    enabled:     r.enabled,
    createdAt:   r.created_at,
    total:       parseInt(r.total,       10),
    pendentes:   parseInt(r.pendentes,   10),
    processados: parseInt(r.processados, 10),
    enfileirados:parseInt(r.enfileirados,10),
    falhas:      parseInt(r.falhas,      10),
  }));
}

// ── Habilitar / Desabilitar lista ─────────────────────────────────────────────

export async function toggleListEnabled(listId, enabled) {
  await query(
    `INSERT INTO campaigns (id, enabled) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET enabled = EXCLUDED.enabled`,
    [listId, enabled]
  );
}

// ── Mesclagem com deduplicação ────────────────────────────────────────────────

export async function mergeLists(newListId, sourceListIds) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO campaigns (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [newListId]
    );

    // DISTINCT ON (phone) dentro de SELECT — deduplicação pura no banco,
    // sem nenhum dado cruzando a rede Node ↔ Postgres.
    const { rowCount } = await client.query(
      `INSERT INTO messages_queue (campaign_id, phone, status)
       SELECT $1, phone, 'importado'
       FROM (
         SELECT DISTINCT phone
         FROM   messages_queue
         WHERE  campaign_id = ANY($2::varchar[])
           AND  status IN ('importado', 'pendente')
       ) AS deduped`,
      [newListId, sourceListIds]
    );

    await client.query('COMMIT');
    return { newListId, inserted: rowCount ?? 0 };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Divisão equilibrada com ntile ─────────────────────────────────────────────

export async function splitList(sourceListId, blocks) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ntile distribui as linhas em N grupos equilibrados — zero lógica em JS.
    const { rows } = await client.query(
      `SELECT phone,
              ntile($2) OVER (ORDER BY id) AS bloco
       FROM   messages_queue
       WHERE  campaign_id = $1
         AND  status IN ('importado', 'pendente')`,
      [sourceListId, blocks]
    );

    if (!rows.length) throw new Error('Nenhum contato disponível nesta lista.');

    // Agrupa em Map<bloco, phone[]>
    const blocoMap = new Map();
    for (const { phone, bloco } of rows) {
      if (!blocoMap.has(bloco)) blocoMap.set(bloco, []);
      blocoMap.get(bloco).push(phone);
    }

    const created = [];
    let partIndex = 1;
    for (const phones of blocoMap.values()) {
      const partId = `Temp part ${partIndex} - ${sourceListId}`;

      await client.query(
        `INSERT INTO campaigns (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
        [partId]
      );
      await client.query(
        `INSERT INTO messages_queue (campaign_id, phone, status)
         SELECT $1, UNNEST($2::text[]), 'importado'`,
        [partId, phones]
      );

      created.push({ id: partId, total: phones.length });
      partIndex++;
    }

    await client.query('COMMIT');
    return { source: sourceListId, blocks: created };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Exclusão de lista ─────────────────────────────────────────────────────────

export async function deleteList(campaignId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM messages_queue WHERE campaign_id = $1', [campaignId]);
    await client.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Leitura e bloqueio atômico (orquestrador) ─────────────────────────────────

export async function fetchAndMarkPendingBatch(campaignId, limit = 500) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT id, phone FROM messages_queue
       WHERE  campaign_id = $1 AND status = 'pendente'
       ORDER  BY id ASC
       LIMIT  $2
       FOR UPDATE SKIP LOCKED`,
      [campaignId, limit]
    );

    if (result.rows.length > 0) {
      const ids = result.rows.map((r) => r.id);
      await client.query(
        `UPDATE messages_queue SET status = 'enfileirado'
         WHERE id = ANY($1::int[])`,
        [ids]
      );
    }

    await client.query('COMMIT');
    return result.rows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Contagem de pendentes ─────────────────────────────────────────────────────

export async function countPending(campaignId) {
  const result = await query(
    `SELECT COUNT(*) AS total FROM messages_queue
     WHERE campaign_id = $1 AND status = 'pendente'`,
    [campaignId]
  );
  return parseInt(result.rows[0]?.total ?? '0', 10);
}

// ── Edição de lista: leitura paginada ────────────────────────────────────────

export async function getListContacts(campaignId, page = 1, limit = 50, search = '') {
  const offset      = (page - 1) * limit;
  const searchParam = search ? `%${search}%` : null;

  const [{ rows }, countResult] = await Promise.all([
    query(
      `SELECT id, phone, status
       FROM   messages_queue
       WHERE  campaign_id = $1
         AND  ($2::text IS NULL OR phone ILIKE $2)
       ORDER  BY id ASC
       LIMIT  $3 OFFSET $4`,
      [campaignId, searchParam, limit, offset]
    ),
    query(
      `SELECT COUNT(*) AS total
       FROM   messages_queue
       WHERE  campaign_id = $1
         AND  ($2::text IS NULL OR phone ILIKE $2)`,
      [campaignId, searchParam]
    ),
  ]);

  return {
    contacts: rows,
    total:    parseInt(countResult.rows[0]?.total ?? '0', 10),
    page,
    limit,
  };
}

// ── Edição de lista: adicionar com deduplicação ───────────────────────────────

export async function addContactsToList(campaignId, phones) {
  if (!phones.length) return { inserted: 0, skipped: 0 };

  const result = await query(
    `INSERT INTO messages_queue (campaign_id, phone, status)
     SELECT $1::varchar, p.phone, 'importado'
     FROM   UNNEST($2::text[]) AS p(phone)
     WHERE  NOT EXISTS (
       SELECT 1 FROM messages_queue mq
       WHERE  mq.campaign_id = $1::varchar AND mq.phone = p.phone
     )`,
    [campaignId, phones]
  );

  const inserted = result.rowCount ?? 0;
  return { inserted, skipped: phones.length - inserted };
}

// ── Edição de lista: remover contato individual ───────────────────────────────

export async function removeContactFromList(campaignId, phone) {
  const result = await query(
    `DELETE FROM messages_queue WHERE campaign_id = $1 AND phone = $2`,
    [campaignId, phone]
  );
  return result.rowCount ?? 0;
}

// ── Armar campanha: importado → pendente (gatilho do orquestrador) ───────────

export async function armCampaign(campaignId) {
  const result = await query(
    `UPDATE messages_queue SET status = 'pendente'
     WHERE campaign_id = $1 AND status = 'importado'`,
    [campaignId]
  );
  return result.rowCount ?? 0;
}

// ── Relatório em tempo real (workers) ─────────────────────────────────────────

export async function updateMessageStatus(id, status) {
  await query(
    `UPDATE messages_queue SET status = $1 WHERE id = $2`,
    [status, id]
  );
}
