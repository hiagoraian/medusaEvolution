import { getAllNetworkStatus, rotateIp } from './network.service.js';
import { ZTE_CONFIG }                   from './network.config.js';

// GET /api/network/status
export async function getNetworkStatus(_req, res) {
  try {
    const devices = await getAllNetworkStatus();
    return res.json({ ts: new Date().toISOString(), devices });
  } catch (err) {
    console.error('[NETWORK] Erro ao obter status:', err.message);
    return res.status(500).json({ error: 'Falha ao verificar hardware.' });
  }
}

// POST /api/network/rotate/:zteId
// Fire-and-forget — retorna 202 imediatamente.
// A rotação leva 90-120s; o cliente deve consultar GET /status para confirmar.
export function triggerRotate(req, res) {
  const { zteId } = req.params;

  if (!ZTE_CONFIG[zteId]) {
    return res.status(400).json({ error: `ZTE desconhecido: "${zteId}". Use ZTE1–ZTE4.` });
  }

  // Inicia em background — não faz await
  rotateIp(zteId).then((result) => {
    const icon = result.success ? '✓' : '✗';
    console.log(`[NETWORK] Rotação ${icon} ${zteId}: ${result.success ? 'concluída' : result.reason}`);
  });

  return res.status(202).json({
    message:     `Rotação iniciada para ${zteId}.`,
    zteId,
    estimatedMs: 120_000,
    checkStatus: `/api/network/status`,
  });
}
