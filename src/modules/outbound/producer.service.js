import { publishMessage, QUEUES } from '../../core/rabbitmq.js';

export function enqueueMessages(campaignId, messages) {
  let enqueued = 0;

  for (const msg of messages) {
    publishMessage(QUEUES.OUTBOUND, {
      campaignId,
      id:             msg.id             ?? null,
      accountId:      msg.accountId,
      phone:          msg.phone,
      texts:          msg.texts          ?? [],    // array de variações — worker sorteia
      text:           msg.text           ?? null,  // backward-compat (test-shoot)
      type:           msg.type           ?? 'text',
      mediaFilePath:  msg.mediaFilePath  ?? null,  // caminho local para mídia em disco
      mediaUrl:       msg.mediaUrl       ?? null,
      mediaType:      msg.mediaType      ?? null,
      caption:        msg.caption        ?? null,
      delayFlexivelMs: msg.delayFlexivelMs ?? null,
      enqueuedAt:     new Date().toISOString(),
    });
    enqueued++;
  }

  console.log(`[PRODUCER] ${enqueued} mensagem(s) enfileirada(s) — campanha: ${campaignId}`);
  return enqueued;
}
