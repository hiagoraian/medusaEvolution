import { randomUUID }      from 'crypto';
import { enqueueMessages } from './producer.service.js';

// POST /api/campaign/test-shoot
export function testShoot(req, res) {
  const { accountId, phone, text } = req.body;
  console.log(`[TEST-SHOOT] Recebido — zap: ${accountId} | phone: ${phone} | text: ${String(text).slice(0, 40)}`);

  if (!accountId || !phone || !text) {
    return res.status(400).json({ error: 'accountId, phone e text são obrigatórios.' });
  }

  try {
    const campaignId = `test-${randomUUID()}`;
    enqueueMessages(campaignId, [{ accountId, phone, text, type: 'text' }]);

    return res.json({
      message:    'Mensagem enfileirada com sucesso.',
      campaignId,
      phone,
    });
  } catch (err) {
    console.error('[OUTBOUND] Erro ao enfileirar mensagem de teste:', err.message);
    return res.status(500).json({ error: 'Falha ao publicar na fila.' });
  }
}
