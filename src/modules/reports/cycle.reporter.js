import 'dotenv/config';
import { query }    from '../../core/postgres.js';
import { sendText } from '../outbound/evolution.outbound.client.js';

function fmt(n) {
  return Number(n ?? 0).toLocaleString('pt-BR');
}

// ── Stats da campanha direto do banco ────────────────────────────────────────

async function getCampaignStats(campaignId) {
  const { rows } = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('enviado', 'invalido'))  AS enviados,
       COUNT(*) FILTER (WHERE status = 'pendente')                AS pendentes,
       COUNT(*) FILTER (WHERE status = 'enfileirado')             AS enfileirados,
       COUNT(*) FILTER (WHERE status = 'falha_tecnica')           AS falhas
     FROM messages_queue
     WHERE campaign_id = $1`,
    [campaignId]
  );
  const r = rows[0] ?? {};
  return {
    enviados:     parseInt(r.enviados     ?? 0, 10),
    pendentes:    parseInt(r.pendentes    ?? 0, 10),
    enfileirados: parseInt(r.enfileirados ?? 0, 10),
    falhas:       parseInt(r.falhas       ?? 0, 10),
  };
}

// ── Envio do relatório via WA-49 ──────────────────────────────────────────────

export async function sendCycleReport({ campaignId, wave, zapsCaidos }) {
  const phone     = process.env.REPORT_PHONE;
  const adminZap  = process.env.ADMIN_ZAP ?? 'WA-49';

  if (!phone) {
    console.warn('[REPORTER] REPORT_PHONE não configurado — relatório de onda ignorado.');
    return;
  }

  let stats;
  try {
    stats = await getCampaignStats(campaignId);
  } catch (err) {
    console.error('[REPORTER] Erro ao buscar stats:', err.message);
    return;
  }

  const caidos = zapsCaidos.length > 0
    ? zapsCaidos.join(', ')
    : 'Nenhum';

  const msg =
    `📊 *Relatório — Onda #${wave}*\n` +
    `*Campanha:* ${campaignId}\n` +
    `---\n` +
    `✅ *Enviados:* ${fmt(stats.enviados)}\n` +
    `⏳ *Pendentes:* ${fmt(stats.pendentes)}\n` +
    `🔁 *Enfileirados:* ${fmt(stats.enfileirados)}\n` +
    `💥 *Falhas:* ${fmt(stats.falhas)}\n` +
    `📵 *Zaps caídos:* ${caidos}`;

  try {
    await sendText(adminZap, `${phone}@s.whatsapp.net`, msg);
    console.log(`[REPORTER] Relatório onda #${wave} enviado para +${phone}.`);
  } catch (err) {
    console.error('[REPORTER] Falha ao enviar relatório:', err.message);
  }
}
