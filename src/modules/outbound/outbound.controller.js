import { randomUUID }      from 'crypto';
import { enqueueMessages } from './producer.service.js';

// POST /api/campaign/test-shoot
export function testShoot(req, res) {
  const { accountId, phone, text, media } = req.body;
  const hasMedia = media?.filePath && media?.mediaType;

  console.log(
    `[TEST-SHOOT] Recebido — zap: ${accountId} | phone: ${phone} | ` +
    `text: ${String(text ?? '').slice(0, 40)} | mídia: ${hasMedia ? media.mediaType : 'nenhuma'}`
  );

  if (!accountId || !phone || (!text && !hasMedia)) {
    return res.status(400).json({ error: 'accountId, phone e ao menos text ou media são obrigatórios.' });
  }

  try {
    const campaignId = `test-${randomUUID()}`;
    const type = hasMedia ? 'media_text' : 'text';

    enqueueMessages(campaignId, [{
      accountId,
      phone,
      type,
      texts:         text ? [text] : [],
      mediaFilePath: hasMedia ? media.filePath  : null,
      mediaType:     hasMedia ? media.mediaType : null,
    }]);

    return res.json({ message: 'Mensagem enfileirada com sucesso.', campaignId, phone });
  } catch (err) {
    console.error('[OUTBOUND] Erro ao enfileirar mensagem de teste:', err.message);
    return res.status(500).json({ error: 'Falha ao publicar na fila.' });
  }
}
