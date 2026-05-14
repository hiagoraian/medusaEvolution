import { connect } from 'amqplib';
import 'dotenv/config';

// ── Topologia ─────────────────────────────────────────────────────────────────

export const EXCHANGE = 'medusa_exchange';  // roteamento principal (direct)
const DLX            = 'medusa_dlx';        // dead-letter exchange

export const QUEUES = {
  OUTBOUND: 'outbound_queue',
  INBOUND:  'inbound_queue',
  WARMUP:   'warmup_queue',
  DLQ:      'dead_letter_queue',
};

// Filas de negócio recebem DLX: mensagens rejeitadas (nack sem requeue) vão para a DLQ
const DLX_ARGS = {
  'x-dead-letter-exchange':    DLX,
  'x-dead-letter-routing-key': QUEUES.DLQ,
};

// ── Estado interno ────────────────────────────────────────────────────────────

let _connection = null;
let _channel    = null;

// ── Conexão ───────────────────────────────────────────────────────────────────

export async function connectRabbitMQ() {
  const url = process.env.RABBITMQ_URL ?? 'amqp://medusa:medusa_secret_change_me@localhost:5672';

  _connection = await connect(url);
  _channel    = await _connection.createChannel();

  console.log('[RABBITMQ] Conectado com sucesso.');

  // Dead-Letter Exchange + DLQ (sem DLX própria — mensagens aqui são terminais)
  await _channel.assertExchange(DLX, 'direct', { durable: true });
  await _channel.assertQueue(QUEUES.DLQ, { durable: true });
  await _channel.bindQueue(QUEUES.DLQ, DLX, QUEUES.DLQ);

  // Exchange principal
  await _channel.assertExchange(EXCHANGE, 'direct', { durable: true });

  // Filas de negócio com rota para DLX em caso de falha
  await _channel.assertQueue(QUEUES.OUTBOUND, { durable: true, arguments: DLX_ARGS });
  await _channel.assertQueue(QUEUES.INBOUND,  { durable: true, arguments: DLX_ARGS });
  await _channel.assertQueue(QUEUES.WARMUP,   { durable: true, arguments: DLX_ARGS });
  await _channel.bindQueue(QUEUES.OUTBOUND, EXCHANGE, QUEUES.OUTBOUND);
  await _channel.bindQueue(QUEUES.INBOUND,  EXCHANGE, QUEUES.INBOUND);
  await _channel.bindQueue(QUEUES.WARMUP,   EXCHANGE, QUEUES.WARMUP);

  console.log('[RABBITMQ] Exchange e filas configurados.');
  console.log(`[RABBITMQ]   Exchange : ${EXCHANGE} (direct)`);
  console.log(`[RABBITMQ]   Filas    : ${Object.values(QUEUES).join(', ')}`);
  console.log(`[RABBITMQ]   DLX      : ${DLX} → ${QUEUES.DLQ}`);

  _connection.on('error', (err) =>
    console.error('[RABBITMQ] Erro na conexão:', err.message)
  );
  _connection.on('close', () =>
    console.warn('[RABBITMQ] Conexão encerrada — reinicie o serviço.')
  );
  _channel.on('error', (err) =>
    console.error('[RABBITMQ] Erro no canal:', err.message)
  );

  return { connection: _connection, channel: _channel };
}

// ── Helpers de mensageria ─────────────────────────────────────────────────────

export function publishMessage(queue, message) {
  if (!_channel) throw new Error('[RABBITMQ] Canal não inicializado. Chame connectRabbitMQ() primeiro.');

  const content = Buffer.from(JSON.stringify(message));
  // persistent:true garante que a mensagem sobreviva a reinicializações do broker
  _channel.publish(EXCHANGE, queue, content, { persistent: true });
}

// Callback recebe: (content, { ack, nack })
// nack(requeue=false) → DLQ  |  nack(requeue=true) → volta para a fila
export async function consumeQueue(queue, callback) {
  if (!_channel) throw new Error('[RABBITMQ] Canal não inicializado. Chame connectRabbitMQ() primeiro.');

  // prefetch(1): o worker só pega a próxima mensagem após confirmar a atual
  await _channel.prefetch(1);

  await _channel.consume(queue, async (msg) => {
    if (!msg) return;

    let content;
    try {
      content = JSON.parse(msg.content.toString());
    } catch {
      console.error(`[RABBITMQ] Payload inválido na fila "${queue}" — enviando para DLQ.`);
      _channel.nack(msg, false, false);
      return;
    }

    const ack  = ()               => _channel.ack(msg);
    const nack = (requeue = false) => _channel.nack(msg, false, requeue);

    try {
      await callback(content, { ack, nack });
    } catch (err) {
      // Erro não tratado pelo worker → DLQ (nunca perde mensagem silenciosamente)
      console.error(`[RABBITMQ] Erro não tratado em "${queue}":`, err.message);
      _channel.nack(msg, false, false);
    }
  });

  console.log(`[RABBITMQ] Consumindo fila: ${queue}`);
}

// ── Acesso ao canal (para operações avançadas nos módulos) ────────────────────

export function getChannel() {
  if (!_channel) throw new Error('[RABBITMQ] Canal não disponível.');
  return _channel;
}
