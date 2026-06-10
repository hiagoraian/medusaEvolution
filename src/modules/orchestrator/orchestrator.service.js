import { fetchAndMarkPendingBatch, countPending, armCampaign } from '../pipeline/pipeline.repository.js';
import { enqueueMessages }                        from '../outbound/producer.service.js';
import { ZTE_CONFIG }                             from '../network/network.config.js';
import { isInstanceOnline }                       from '../identity/cache.service.js';
import { setCache, delCache, getCache }           from '../../core/redis.js';

// ── Constantes ────────────────────────────────────────────────────────────────

const MAX_WAVE_SIZE       = 500;        // teto por onda
const WAVE_INTERVAL_MS    = 60 * 60_000; // cada onda cobre ~1h
const OUT_OF_WINDOW_MS    = 5 * 60_000; // 5 min hibernando fora da janela
const NO_ACCOUNTS_MS      = 2 * 60_000; // 2 min se todas as instâncias caírem
const NO_ACCOUNTS_MAX     = 10;         // 10 × 2min = pausa automática após 20 min offline
const STOP_POLL_INTERVAL  = 10_000;     // granularidade do sleep interrompível
const MIN_DELAY_MS        = 15_000;     // freio de mão: nunca < 15 s entre envios

// ── Estado global (singleton por processo) ────────────────────────────────────

const REDIS_KEY = 'orchestrator:active_campaign';

let isCampaignRunning = false;
let stopRequested     = false;
let isPaused          = false;
let suspendMode       = false; // true = para o loop mas mantém Redis (recovery modal)
let _activeCampaign   = null; // { campaignId, texts, options, startedAt }
let _pausedZaps       = [];   // ZAPs que causaram a pausa

// ── Helpers internos ──────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function interruptibleSleep(ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (stopRequested) return;
    await sleep(Math.min(STOP_POLL_INTERVAL, deadline - Date.now()));
  }
}

// Janela de disparo: 08:00–19:45, sempre em horário de São Paulo.
export function isWithinWindow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour:    '2-digit',
    minute:  '2-digit',
    hour12:  false,
  }).formatToParts(new Date());
  const get      = (t) => parseInt(parts.find((p) => p.type === t)?.value ?? '0');
  const totalMin = get('hour') * 60 + get('minute');
  return totalMin >= 8 * 60 && totalMin < 19 * 60 + 45;
}

function isWithinSchedule(startAt, endAt) {
  const now = new Date();
  if (startAt && now < new Date(startAt)) return false;
  if (endAt   && now > new Date(endAt))   return false;
  return true;
}

// allowedZaps: array de IDs selecionados pelo usuário. Vazio = usa todos os 48.
async function getOnlineAccounts(allowedZaps = []) {
  const all        = Object.values(ZTE_CONFIG).flatMap((z) => z.accounts);
  const candidates = allowedZaps.length > 0
    ? all.filter((id) => allowedZaps.includes(id))
    : all;

  const results = await Promise.all(
    candidates.map(async (accountId) => ({
      accountId,
      online: await isInstanceOnline(accountId),
    }))
  );
  return results.filter((r) => r.online).map((r) => r.accountId);
}

// ── Calculadora de delay flexível ─────────────────────────────────────────────

// Deriva a duração total do período agendado; fallback para 4h sem agendamento.
function durationFromSchedule(startAt, endAt) {
  if (startAt && endAt) {
    const ms = new Date(endAt) - new Date(startAt);
    return Math.max(ms / 3_600_000, 0.25);
  }
  if (endAt) {
    const ms = new Date(endAt) - Date.now();
    return ms > 0 ? Math.max(ms / 3_600_000, 0.25) : 4;
  }
  return 4;
}

// Retorna quantas msgs desta onda e o delay entre cada uma.
// Cada onda cobre ~1h; o tamanho é totalPending / horas restantes.
function calcWave(endAt, totalPending, durationHours) {
  const remainingMs    = endAt
    ? Math.max(new Date(endAt) - Date.now(), 0)
    : durationHours * 3_600_000;
  const remainingHours = remainingMs / 3_600_000;

  // Quantidade de msgs desta onda: 1 hora de mensagens, no máximo MAX_WAVE_SIZE
  const waveSize = remainingHours >= 1
    ? Math.min(Math.ceil(totalPending / Math.floor(remainingHours)), MAX_WAVE_SIZE)
    : Math.min(totalPending, MAX_WAVE_SIZE); // última fração de hora: envia tudo

  // Delay que distribui a onda pelo intervalo de 1h (ou tempo restante se < 1h)
  const waveDurationMs = Math.min(remainingMs || WAVE_INTERVAL_MS, WAVE_INTERVAL_MS);
  const delayMs        = waveSize > 0
    ? Math.max(waveDurationMs / waveSize, MIN_DELAY_MS)
    : MIN_DELAY_MS;

  return { waveSize: Math.max(waveSize, 1), delayMs, remainingMs };
}

// ── Loop principal ────────────────────────────────────────────────────────────

async function runCampaignLoop(campaignId, texts, options) {
  const { durationHours, startAt, endAt, media, maxOfflineZaps } = options;
  let wave = 0;
  let noZapsCount = 0;

  while (!stopRequested) {

    // ── Passo 1: Validação de período configurado ─────────────────────────
    if (!isWithinSchedule(startAt, endAt)) {
      const now = new Date();
      if (startAt && now < new Date(startAt)) {
        const waitMs = Math.min(new Date(startAt) - now, OUT_OF_WINDOW_MS);
        console.log(`[ORCHESTRATOR] Aguardando início agendado (${new Date(startAt).toLocaleString('pt-BR')}). Hibernando...`);
        await interruptibleSleep(waitMs);
        continue;
      }
      console.log(`[ORCHESTRATOR] Campanha "${campaignId}" encerrada — período configurado expirou.`);
      break;
    }

    // ── Passo 1b: Validação de janela diária ──────────────────────────────
    if (!isWithinWindow()) {
      console.log(`[ORCHESTRATOR] Fora da janela (08:00–19:45). Hibernando 5 min...`);
      await interruptibleSleep(OUT_OF_WINDOW_MS);
      continue;
    }

    // ── Passo 2: Contagem de pendentes + cálculo de delay ─────────────────
    let totalPending;
    try {
      totalPending = await countPending(campaignId);
    } catch (err) {
      console.error('[ORCHESTRATOR] Erro ao contar pendentes:', err.message, '— tentando em 30s.');
      await interruptibleSleep(30_000);
      continue;
    }

    if (totalPending === 0) {
      console.log(`[ORCHESTRATOR] Campanha "${campaignId}" concluída — sem contatos pendentes.`);
      break;
    }

    const { waveSize, delayMs: delayFlexivelMs, remainingMs } = calcWave(endAt, totalPending, durationHours);

    const remainingMin = (remainingMs / 60_000).toFixed(0);
    console.log(
      `[ORCHESTRATOR] Campanha "${campaignId}" | ` +
      `Pendentes: ${totalPending} | ` +
      `Tempo restante: ${remainingMin} min | ` +
      `Onda: ${waveSize} msgs | ` +
      `Delay: ${(delayFlexivelMs / 1000).toFixed(1)}s por mensagem`
    );

    // ── Passo 3: Lote atômico (fetch + marca como 'enfileirado') ──────────
    let batch;
    try {
      batch = await fetchAndMarkPendingBatch(campaignId, waveSize);
    } catch (err) {
      console.error('[ORCHESTRATOR] Erro ao buscar lote:', err.message, '— tentando em 30s.');
      await interruptibleSleep(30_000);
      continue;
    }

    if (!batch.length) {
      console.log(`[ORCHESTRATOR] Campanha "${campaignId}" concluída.`);
      break;
    }

    // ── Passo 4: Instâncias online (filtradas pelos ZAPs selecionados, se houver) ─
    const online = await getOnlineAccounts(options.zaps ?? []);
    if (!online.length) {
      noZapsCount++;
      if (noZapsCount >= NO_ACCOUNTS_MAX) {
        noZapsCount = 0;
        isPaused    = true;
        console.log(`[ORCHESTRATOR] ${NO_ACCOUNTS_MAX} verificações sem ZAPs online (~20 min) — campanha pausada automaticamente. Aguardando operador.`);
        while (isPaused && !stopRequested) {
          await sleep(STOP_POLL_INTERVAL);
        }
        _pausedZaps = [];
        if (!stopRequested) console.log('[ORCHESTRATOR] Campanha retomada após pausa automática.');
        continue;
      }
      console.warn(`[ORCHESTRATOR] Nenhuma instância online (${noZapsCount}/${NO_ACCOUNTS_MAX}). Aguardando ${NO_ACCOUNTS_MS / 60_000} min...`);
      await interruptibleSleep(NO_ACCOUNTS_MS);
      continue;
    }
    noZapsCount = 0;

    // ── Passo 5: Enfileira com delay + textos + mídia no payload ─────────
    const messages = batch.map((contact, i) => ({
      id:             contact.id,
      phone:          contact.phone,
      accountId:      online[i % online.length],
      texts,             // array completo viaja junto — worker sorteia na hora do envio
      delayFlexivelMs,   // cadenciamento calculado matematicamente
      type:           media ? 'media_text' : 'text', // media_text = texto + mídia
      mediaFilePath:  media?.filePath  ?? null,
      mediaType:      media?.mediaType ?? null,
      campaignId,
    }));

    enqueueMessages(campaignId, messages);

    wave++;
    console.log(
      `[ORCHESTRATOR] Onda #${wave} | ${batch.length} msgs enfileiradas | ` +
      `${online.length} instância(s) | ` +
      `Tempo estimado da onda: ${((batch.length * delayFlexivelMs) / 60_000).toFixed(1)} min`
    );

    // ── Passo 6: Dorme o tempo da onda (batch × delay) ────────────────────
    const waveDurationMs = batch.length * delayFlexivelMs;
    await interruptibleSleep(waveDurationMs);

    if (stopRequested) break;

    // ── Passo 6.5: Relatório de fim de onda ───────────────────────────────
    // Detecta ZAPs que caíram durante a onda comparando com o snapshot anterior.
    const onlineAgora  = await getOnlineAccounts(options.zaps ?? []);
    const onlineSet    = new Set(onlineAgora);
    const zapsCaidos   = online.filter((id) => !onlineSet.has(id));

    // ── Passo 6.6: Verificar limite de ZAPs offline ───────────────────────
    if (maxOfflineZaps && zapsCaidos.length >= maxOfflineZaps) {
      _pausedZaps = zapsCaidos;
      isPaused    = true;
      console.log(
        `[ORCHESTRATOR] ${zapsCaidos.length} ZAP(s) desconectados (limite: ${maxOfflineZaps}) — ` +
        `pausado aguardando decisão do operador. ZAPs: ${zapsCaidos.join(', ')}`
      );
      while (isPaused && !stopRequested) {
        await sleep(STOP_POLL_INTERVAL);
      }
      _pausedZaps = [];
      if (!stopRequested) console.log('[ORCHESTRATOR] Campanha retomada pelo operador.');
    }

  }

  stopRequested = false;
}

// ── API pública ───────────────────────────────────────────────────────────────

export async function startCampaign(campaignId, texts, options = {}) {
  if (isCampaignRunning) {
    return {
      success: false,
      reason:  `Campanha "${_activeCampaign?.campaignId}" já está em execução.`,
    };
  }

  const startAt = options.startAt ?? null;
  const endAt   = options.endAt   ?? null;

  const opts = {
    durationHours:  durationFromSchedule(startAt, endAt),
    maxPerZap:      options.maxPerZap ?? 30,
    maxOfflineZaps: options.maxOfflineZaps ? Number(options.maxOfflineZaps) : null,
    zaps:           Array.isArray(options.zaps) ? options.zaps : [],
    startAt,
    endAt,
    media:          options.media ?? null,
  };

  // Arma a campanha: converte 'importado' → 'pendente' (lista em repouso vira ativa)
  const armed = await armCampaign(campaignId);
  console.log(`[ORCHESTRATOR] Campanha "${campaignId}" armada — ${armed} contato(s) prontos.`);

  isCampaignRunning = true;
  stopRequested     = false;
  _activeCampaign   = {
    campaignId,
    campaignName: options.campaignName ?? campaignId,
    texts,
    options: opts,
    startedAt: new Date().toISOString(),
  };

  // Persiste no Redis para recuperação após crash/restart
  await setCache(REDIS_KEY, _activeCampaign);

  console.log(
    `[ORCHESTRATOR] Iniciando campanha "${campaignId}" | ` +
    `${texts.length} texto(s) | ` +
    `Duração calculada: ${opts.durationHours.toFixed(1)}h | ` +
    `Máx/Zap: ${opts.maxPerZap}`
  );

  runCampaignLoop(campaignId, texts, opts)
    .then(() =>  console.log(`[ORCHESTRATOR] Loop encerrado para "${campaignId}".`))
    .catch((err) => console.error(`[ORCHESTRATOR] Erro fatal:`, err.message))
    .finally(() => {
      isCampaignRunning = false;
      _activeCampaign   = null;
      isPaused          = false;
      _pausedZaps       = [];
      if (!suspendMode) delCache(REDIS_KEY).catch(() => {});
      suspendMode = false;
    });

  return {
    success:    true,
    campaignId,
    message:    'Loop iniciado em background.',
    textsCount: texts.length,
    options:    opts,
  };
}

export function stopCampaign() {
  if (!isCampaignRunning) {
    return { success: false, reason: 'Nenhuma campanha em execução.' };
  }
  stopRequested = true;
  console.log('[ORCHESTRATOR] Parada solicitada — encerrando na próxima iteração (≤ 10s).');
  return {
    success:  true,
    message:  'Parada solicitada. A campanha encerrará em até 10 segundos.',
    campaign: _activeCampaign,
  };
}

export function getCampaignState() {
  return {
    running:       isCampaignRunning,
    paused:        isPaused,
    pausedZaps:    _pausedZaps,
    campaign:      _activeCampaign,
    stopRequested,
  };
}

export function resumeCampaign() {
  if (!isPaused) return { success: false, reason: 'Campanha não está pausada.' };
  isPaused = false;
  console.log('[ORCHESTRATOR] Retomada solicitada pelo operador.');
  return { success: true };
}

export function suspendCampaign() {
  if (!isCampaignRunning) return { success: false, reason: 'Nenhuma campanha em execução.' };
  suspendMode   = true;
  isPaused      = false;
  stopRequested = true;
  console.log('[ORCHESTRATOR] Suspensão solicitada — estado preservado no Redis para recovery.');
  return { success: true };
}

export async function getRecoveryState() {
  if (isCampaignRunning) return null;
  return getCache(REDIS_KEY);
}

export async function clearRecoveryState() {
  return delCache(REDIS_KEY);
}
