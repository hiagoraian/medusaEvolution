import { startCampaign, stopCampaign, getCampaignState, getRecoveryState, clearRecoveryState, resumeCampaign, suspendCampaign } from './orchestrator.service.js';
import { purgeQueue, QUEUES }     from '../../core/rabbitmq.js';
import { getCampaignDbStats }     from '../reports/reports.repository.js';
import { resetListContacts }      from '../pipeline/pipeline.repository.js';
import fs                         from 'fs';

// POST /api/orchestrator/start
export async function startHandler(req, res) {
  const {
    campaignId,
    campaignName,
    texts        = [],
    maxPerZap    = 30,
    zaps         = '',
    startAt,
    endAt,
    media,       // { filePath, mediaType } — opcional
    // backward-compat: front antigo pode mandar `text` (string singular)
    text,
  } = req.body;

  if (!campaignId) return res.status(400).json({ error: 'campaignId é obrigatório.' });

  // M5 — Valida arquivo de mídia antes de iniciar
  if (media?.filePath && !fs.existsSync(media.filePath)) {
    return res.status(400).json({ error: `Arquivo de mídia não encontrado: ${media.filePath}. Faça o upload novamente.` });
  }

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

  // A2 — Limpa contatos presos em 'enfileirado' de sessões anteriores
  await resetListContacts(campaignId).catch(() => {});

  const result = await startCampaign(campaignId, normalizedTexts, {
    campaignName:  campaignName?.trim() || campaignId,
    maxPerZap:     Number(maxPerZap) || 30,
    maxOfflineZaps: req.body.maxOfflineZaps ? Number(req.body.maxOfflineZaps) : null,
    zaps:          normalizedZaps,
    startAt:       startAt ?? null,
    endAt:         endAt   ?? null,
    media:         (media?.filePath && media?.mediaType) ? media : null,
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
export async function statusHandler(_req, res) {
  const state = getCampaignState();
  if (state.running && state.campaign?.campaignId) {
    try {
      const stats = await getCampaignDbStats(state.campaign.campaignId);
      return res.json({ ...state, stats });
    } catch { /* ignora falha no stats — retorna sem ele */ }
  }
  return res.json(state);
}

// GET /api/orchestrator/recovery
export async function recoveryStatusHandler(_req, res) {
  try {
    const campaign = await getRecoveryState();
    return res.json({ interrupted: !!campaign, campaign: campaign ?? null });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// POST /api/orchestrator/recover
export async function recoverHandler(_req, res) {
  const state = await getRecoveryState();
  if (!state) return res.status(404).json({ error: 'Nenhuma campanha interrompida para retomar.' });

  // Limpa a fila e reseta contatos presos como enfileirado → importado
  // para que o armCampaign os re-arme corretamente
  try { await purgeQueue(QUEUES.OUTBOUND); } catch { /* ignora se fila já estava vazia */ }
  try { await resetListContacts(state.campaignId); } catch { /* ignora */ }

  const result = await startCampaign(state.campaignId, state.texts, {
    ...state.options,
    campaignName: state.campaignName,
  });

  if (!result.success) return res.status(409).json({ error: result.reason });
  return res.status(202).json(result);
}

// DELETE /api/orchestrator/recovery
export async function cancelRecoveryHandler(_req, res) {
  try {
    await clearRecoveryState();
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// POST /api/orchestrator/resume
export function resumeHandler(_req, res) {
  const result = resumeCampaign();
  if (!result.success) return res.status(409).json({ error: result.reason });
  return res.json(result);
}

// POST /api/orchestrator/suspend
export function suspendHandler(_req, res) {
  const result = suspendCampaign();
  if (!result.success) return res.status(409).json({ error: result.reason });
  return res.json(result);
}

// POST /api/orchestrator/purge
export async function purgeHandler(_req, res) {
  try {
    stopCampaign();
  } catch { /* ignora se não havia campanha */ }
  try {
    const count = await purgeQueue(QUEUES.OUTBOUND);
    console.log(`[ORCHESTRATOR] Fila limpa — ${count} mensagem(s) descartada(s).`);
    return res.json({ ok: true, purged: count });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
