import { getDashboardStats, getCampaignsHistory, exportContacts } from './reports.repository.js';

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
