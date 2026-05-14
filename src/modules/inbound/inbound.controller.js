import { fetchGroups } from '../outbound/evolution.outbound.client.js';

export async function listGroups(req, res) {
  const { accountId } = req.params;

  if (!accountId) {
    return res.status(400).json({ error: 'accountId é obrigatório.' });
  }

  try {
    const raw    = await fetchGroups(accountId);
    const groups = (Array.isArray(raw) ? raw : []).map((g) => ({
      id:   g.id,
      name: g.subject ?? g.name ?? g.id,
    }));
    return res.json({ accountId, count: groups.length, groups });
  } catch (err) {
    console.error(`[INBOUND] Erro ao buscar grupos de "${accountId}":`, err.message);
    return res.status(502).json({ error: 'Falha ao consultar grupos na Evolution API.' });
  }
}
