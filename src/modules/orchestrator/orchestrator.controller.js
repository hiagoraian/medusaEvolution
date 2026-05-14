import { startCampaign, stopCampaign, getCampaignState } from './orchestrator.service.js';

// POST /api/orchestrator/start
export async function startHandler(req, res) {
  const {
    campaignId,
    texts        = [],
    durationHours = 1,
    maxPerZap    = 30,
    zaps         = '',
    // backward-compat: front antigo pode mandar `text` (string singular)
    text,
  } = req.body;

  if (!campaignId) return res.status(400).json({ error: 'campaignId é obrigatório.' });

  // Normaliza textos: aceita array `texts` ou string singular `text`
  const normalizedTexts = Array.isArray(texts) && texts.length
    ? texts.filter((t) => typeof t === 'string' && t.trim())
    : (text ? [text] : []);

  if (!normalizedTexts.length) {
    return res.status(400).json({ error: 'Envie ao menos um texto em "texts" (array) ou "text" (string).' });
  }

  // zaps pode chegar como array (novo UI) ou string legada separada por vírgulas
  const normalizedZaps = Array.isArray(zaps)
    ? zaps.filter(Boolean)
    : (typeof zaps === 'string' && zaps.trim()
        ? zaps.split(',').map((z) => z.trim()).filter(Boolean)
        : []);

  const result = await startCampaign(campaignId, normalizedTexts, {
    durationHours: Number(durationHours) || 1,
    maxPerZap:     Number(maxPerZap)     || 30,
    zaps:          normalizedZaps,
  });

  if (!result.success) {
    return res.status(409).json({ error: result.reason });
  }

  // 202 Accepted — o loop roda em background
  return res.status(202).json(result);
}

// POST /api/orchestrator/stop
export function stopHandler(_req, res) {
  const result = stopCampaign();
  if (!result.success) return res.status(409).json({ error: result.reason });
  return res.json(result);
}

// GET /api/orchestrator/status
export function statusHandler(_req, res) {
  return res.json(getCampaignState());
}
