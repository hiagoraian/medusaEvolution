import { getWarmupSettings, saveWarmupSettings } from './warmup.repository.js';

function toApiShape(s) {
  return {
    active:      s.isActive,
    level:       s.intensity,
    allowedDays: s.allowedDays,
    activeZaps:  s.selectedZaps,
    startAt:     s.startAt ?? null,
    endAt:       s.endAt   ?? null,
  };
}

// GET /api/warmup/config
export async function getConfigHandler(_req, res) {
  try {
    return res.json(toApiShape(await getWarmupSettings()));
  } catch (err) {
    console.error('[WARMUP] Erro ao ler config:', err.message);
    return res.status(500).json({ error: 'Falha ao ler configurações.' });
  }
}

// POST /api/warmup/config
export async function updateConfigHandler(req, res) {
  const { active, level, allowedDays, activeZaps, startAt, endAt } = req.body;

  try {
    const current = await getWarmupSettings();

    await saveWarmupSettings({
      isActive:     active !== undefined ? Boolean(active)                         : current.isActive,
      intensity:    level  !== undefined ? Math.min(5, Math.max(1, Number(level))) : current.intensity,
      allowedDays:  [0, 1, 2, 3, 4, 5, 6], // todos os dias — seletor removido da UI
      selectedZaps: Array.isArray(activeZaps) ? activeZaps                        : current.selectedZaps,
      startAt:      startAt !== undefined ? (startAt || null)                     : current.startAt,
      endAt:        endAt   !== undefined ? (endAt   || null)                     : current.endAt,
    });

    const updated = await getWarmupSettings();
    console.log('[WARMUP] Config atualizada:', updated);
    return res.json({ status: 'ok', config: toApiShape(updated) });
  } catch (err) {
    console.error('[WARMUP] Erro ao salvar config:', err.message);
    return res.status(500).json({ error: 'Falha ao salvar configurações.' });
  }
}
