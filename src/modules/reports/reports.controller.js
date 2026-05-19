import { getDashboardStats, getCampaignsHistory, exportContacts } from './reports.repository.js';
import { getAllZapStats, resetZapStats } from './zap-stats.repository.js';
import { ZTE_CONFIG } from '../network/network.config.js';

const ALL_ZAP_IDS = Object.values(ZTE_CONFIG).flatMap((z) => z.accounts).sort(
  (a, b) => parseInt(a.replace('WA-', '')) - parseInt(b.replace('WA-', ''))
);

// GET /api/reports/dashboard
export async function dashboardHandler(_req, res) {
  try {
    const stats = await getDashboardStats();
    return res.json(stats);
  } catch (err) {
    console.error('[REPORTS] Erro ao buscar estatísticas:', err.message);
    return res.status(500).json({ error: 'Falha ao consultar o banco de dados.' });
  }
}

// GET /api/reports/history
export async function historyHandler(_req, res) {
  try {
    const campaigns = await getCampaignsHistory();
    return res.json(campaigns);
  } catch (err) {
    console.error('[REPORTS] Erro ao buscar histórico:', err.message);
    return res.status(500).json({ error: 'Falha ao consultar histórico de campanhas.' });
  }
}

// GET /api/reports/export/:campaignId/:status
export async function exportHandler(req, res) {
  const { campaignId, status } = req.params;

  try {
    const phones = await exportContacts(campaignId, status);

    if (!phones.length) {
      return res.status(404).json({ error: 'Nenhum contato encontrado para esses filtros.' });
    }

    const fileName = `${campaignId}_${status}.txt`
      .replace(/[^a-zA-Z0-9_\-\.]/g, '_');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(phones.join('\n'));
  } catch (err) {
    console.error('[REPORTS] Erro na exportação:', err.message);
    if (err.message.startsWith('Status inválido')) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Falha ao exportar contatos.' });
  }
}

// GET /api/reports/zap-stats
export async function zapStatsHandler(_req, res) {
  try {
    const stats = await getAllZapStats(ALL_ZAP_IDS);
    return res.json(stats);
  } catch (err) {
    console.error('[REPORTS] Erro ao buscar zap-stats:', err.message);
    return res.status(500).json({ error: 'Falha ao buscar estatísticas dos ZAPs.' });
  }
}

// POST /api/reports/zap-stats/:accountId/reset
export async function zapStatsResetHandler(req, res) {
  const { accountId } = req.params;
  try {
    await resetZapStats(accountId);
    return res.json({ ok: true, accountId });
  } catch (err) {
    console.error('[REPORTS] Erro ao resetar zap-stats:', err.message);
    return res.status(500).json({ error: 'Falha ao resetar ZAP.' });
  }
}
