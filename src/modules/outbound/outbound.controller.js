import fs                               from 'fs';
import { sendText, sendMedia }          from './evolution.outbound.client.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// POST /api/campaign/test-shoot — envio síncrono (aguarda resultado real da Evolution API)
export async function testShoot(req, res) {
  const { accountId, phone, text, media } = req.body;
  const hasMedia = media?.filePath && media?.mediaType;

  console.log(
    `[TEST-SHOOT] Recebido — zap: ${accountId} | phone: ${phone} | ` +
    `text: ${String(text ?? '').slice(0, 40)} | mídia: ${hasMedia ? media.mediaType : 'nenhuma'}`
  );

  if (!accountId || !phone || (!text && !hasMedia)) {
    return res.status(400).json({ error: 'accountId, phone e ao menos text ou media são obrigatórios.' });
  }

  if (hasMedia && !fs.existsSync(media.filePath)) {
    return res.status(400).json({ error: `Arquivo de mídia não encontrado. Faça o upload novamente.` });
  }

  try {
    if (hasMedia) {
      const b64 = fs.readFileSync(media.filePath).toString('base64');
      await sendMedia(accountId, phone, b64, media.mediaType, '');
      if (text?.trim()) {
        await sleep(1_500);
        await sendText(accountId, phone, text.trim());
      }
    } else {
      await sendText(accountId, phone, text.trim());
    }

    console.log(`[TEST-SHOOT] ✓ Enviado para +${phone} via "${accountId}"`);
    return res.json({ sent: true, phone, accountId });

  } catch (err) {
    const httpStatus = err.response?.status;
    const errBody    = err.response?.data;
    const errMsg     = (typeof errBody === 'string' ? errBody : errBody?.message ?? err.message ?? 'Erro desconhecido');

    console.error(`[TEST-SHOOT] ✗ Falha para +${phone} via "${accountId}": HTTP ${httpStatus ?? 'N/A'} — ${errMsg}`);
    return res.status(httpStatus ?? 500).json({ error: errMsg, detail: errBody ?? null });
  }
}
