import 'dotenv/config';
import { getWarmupSettings }           from './warmup.repository.js';
import { generateWarmupTask }          from './warmup.service.js';
import { publishMessage, QUEUES }      from '../../core/rabbitmq.js';
import { isInstanceOnline }            from '../identity/cache.service.js';
import { fetchAllInstancesPhones }     from '../identity/evolution.client.js';

// ── Configurações de tempo ────────────────────────────────────────────────────

const BASE_INTERVAL_MS = 5 * 60 * 1_000;  // 5 minutos
const JITTER_MS        = 60 * 1_000;       // ±1 minuto

function nextDelay() {
  return BASE_INTERVAL_MS + Math.floor((Math.random() * 2 - 1) * JITTER_MS);
}

// Pares máximos por nível de intensidade
const PAIRS_BY_LEVEL = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };

// ── Janela de operação ────────────────────────────────────────────────────────

// Usa o fuso de São Paulo explicitamente — independe da TZ do servidor.
function spParts() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour:    '2-digit',
    minute:  '2-digit',
    weekday: 'short',
    hour12:  false,
  }).formatToParts(new Date());
}

function isWithinWindow(allowedDays) {
  const parts   = spParts();
  const get     = (t) => parts.find((p) => p.type === t)?.value ?? '0';
  const hour    = parseInt(get('hour'));
  const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(get('weekday'));

  if (hour < 8 || hour >= 20)          return false;
  if (!allowedDays.includes(weekday))  return false;
  return true;
}

// Verifica se estamos dentro do período start_at → end_at configurado pelo usuário.
// null em ambos = sem restrição de período.
function isWithinSchedule(startAt, endAt) {
  const now = new Date();
  if (startAt && now < new Date(startAt)) return false;
  if (endAt   && now > new Date(endAt))   return false;
  return true;
}

// ── Fisher-Yates shuffle ─────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Tick principal ────────────────────────────────────────────────────────────

async function tick() {
  const { isActive, intensity, allowedDays, selectedZaps, startAt, endAt } = await getWarmupSettings();

  if (!isActive) return;

  if (!isWithinSchedule(startAt, endAt)) {
    const reason = startAt && new Date() < new Date(startAt)
      ? `aguardando início (${new Date(startAt).toLocaleString('pt-BR')})`
      : `período encerrado (${new Date(endAt).toLocaleString('pt-BR')})`;
    console.log(`[WARMUP-CRON] Fora do período configurado — ${reason}.`);
    return;
  }

  if (!isWithinWindow(allowedDays)) {
    console.log('[WARMUP-CRON] Fora da janela de operação (08:00–20:00) — hibernando.');
    return;
  }

  if (!selectedZaps.length) {
    console.log('[WARMUP-CRON] Nenhum Zap configurado — abortando ciclo.');
    return;
  }

  // Filtra apenas os Zaps online no Redis
  const onlineChecks = await Promise.all(
    selectedZaps.map(async (id) => ({ id, online: await isInstanceOnline(id) }))
  );
  const onlineZaps = onlineChecks.filter((z) => z.online).map((z) => z.id);

  if (onlineZaps.length < 2) {
    console.log(`[WARMUP-CRON] Menos de 2 Zaps online (${onlineZaps.length}) — ping-pong impossível. Abortando ciclo.`);
    return;
  }

  const shuffled  = shuffle(onlineZaps);
  const maxPairs  = PAIRS_BY_LEVEL[intensity] ?? 1;
  const numPairs  = Math.min(maxPairs, Math.floor(shuffled.length / 2));

  console.log(`[WARMUP] Ciclo iniciado. Nível ${intensity}. Gerando ping-pong entre ${numPairs} par${numPairs > 1 ? 'es' : ''}.`);

  // Busca mapa instanceName → ownerJid para formar os JIDs de destino
  const phonesMap = await fetchAllInstancesPhones();

  let published = 0;
  for (let i = 0; i < numPairs; i++) {
    const sender   = shuffled[i * 2];
    const receiver = shuffled[i * 2 + 1];
    const targetJid = phonesMap[receiver];

    if (!targetJid) {
      console.warn(`[WARMUP-CRON] JID de "${receiver}" não encontrado na Evolution API — par ignorado.`);
      continue;
    }

    const task = generateWarmupTask(sender, targetJid, intensity);
    publishMessage(QUEUES.WARMUP, task);
    console.log(`[WARMUP-CRON] Par ${i + 1}: ${sender} → ${receiver} (${targetJid}) [${task.type}]`);
    published++;
  }

  console.log(`[WARMUP-CRON] Ciclo encerrado. ${published} mensagem${published !== 1 ? 's' : ''} enfileirada${published !== 1 ? 's' : ''}.`);
}

// ── Agendador com jitter ──────────────────────────────────────────────────────

export function startWarmupCron() {
  console.log('[WARMUP-CRON] Agendador iniciado (intervalo ~5 min ±1 min).');

  function schedule() {
    const delay = nextDelay();
    setTimeout(async () => {
      try {
        await tick();
      } catch (err) {
        console.error('[WARMUP-CRON] Erro no tick:', err.message);
      }
      schedule();
    }, delay);
  }

  schedule();
}
