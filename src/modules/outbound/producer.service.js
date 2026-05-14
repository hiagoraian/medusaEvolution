import { publishMessage, QUEUES } from '../../core/rabbitmq.js';

// messages: Array<{ id?, accountId, phone, text, type?, mediaUrl?, mediaType?, caption? }>
// id = messages_queue.id — incluso pelo orquestrador para relatórios em tempo real
export function enqueueMessages(campaignId, messages) {
  let enqueued = 0;

  for (const msg of messages) {
    publishMessage(QUEUES.OUTBOUND, {
      campaignId,
      id:         msg.id         ?? null,   // chave do messages_queue para UPDATE de status
      accountId:  msg.accountId,
      phone:      msg.phone,
      text:       msg.text       ?? null,
      type:       msg.type       ?? 'text',
      mediaUrl:   msg.mediaUrl   ?? null,
      mediaType:  msg.mediaType  ?? null,
      caption:    msg.caption    ?? null,
      enqueuedAt: new Date().toISOString(),
    });
    enqueued++;
  }

  console.log(`[PRODUCER] ${enqueued} mensagem(s) enfileirada(s) — campanha: ${campaignId}`);
  return enqueued;
}
