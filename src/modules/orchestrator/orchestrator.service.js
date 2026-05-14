import { fetchAndMarkPendingBatch, countPending, armCampaign } from '../pipeline/pipeline.repository.js';
import { enqueueMessages }                        from '../outbound/producer.service.js';
import { rotateIp }                               from '../network/network.service.js';
import { ZTE_CONFIG, getAllZteIds }               from '../network/network.config.js';
import { isInstanceOnline }                       from '../identity/cache.service.js';
import { sendCycleReport }                        from '../reports/cycle.reporter.js';

// ── Constantes ────────────────────────────────────────────────────────────────

const BATCH_SIZE          = 500;
const ROTATION_STAGGER_MS = 15_000;   // 15 s entre rotações de cada ZTE
const OUT_OF_WINDOW_MS    = 5 * 60_000; // 5 min hibernando fora da janela
const NO_ACCOUNTS_MS      = 2 * 60_000; // 2 min se todas as instâncias caírem
const STOP_POLL_INTERVAL  = 10_000;     // granularidade do sleep interrompível
const MIN_DELAY_MS        = 15_000;     // freio de mão: nunca < 15 s entre envios

// ── Estado global (singleton por processo) ────────────────────────────────────

let isCampaignRunning = false;
let stopRequested     = false;
let _activeCampaign   = null; // { campaignId, texts, options, startedAt }

// ── Helpers internos ──────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function interruptibleSleep(ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (stopRequested) return;
    await sleep(Math.min(STOP_POLL_INTERVAL, deadline - Date.now()));
  }
}

// Janela de disparo: 08:00–19:45 (horário local do servidor).
// Configure TZ=America/Sao_Paulo no .env para garantir o fuso correto.
export function isWithinWindow() {
  const now      = new Date();
  const totalMin = now.getHours() * 60 + now.getMinutes();
  return totalMin >= 8 * 60 && totalMin < 19 * 60 + 45;
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

function calcDelay(durationHours, totalPending) {
  if (!totalPending) return MIN_DELAY_MS;
  const totalMs        = durationHours * 60 * 60 * 1_000;
  const delayFlexivel  = totalMs / totalPending;
  return Math.max(delayFlexivel, MIN_DELAY_MS);
}

// ── Loop principal ────────────────────────────────────────────────────────────

async function runCampaignLoop(campaignId, texts, options) {
  const { durationHours } = options;
  let wave = 0;

  while (!stopRequested) {

    // ── Passo 1: Validação de horário ─────────────────────────────────────
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

    const delayFlexivelMs = calcDelay(durationHours, totalPending);

    console.log(
      `[ORCHESTRATOR] Campanha "${campaignId}" | ` +
      `Pendentes: ${totalPending} | ` +
      `Duração: ${durationHours}h | ` +
      `Delay calculado: ${(delayFlexivelMs / 1000).toFixed(1)}s por mensagem`
    );

    // ── Passo 3: Lote atômico (fetch + marca como 'enfileirado') ──────────
    let batch;
    try {
      batch = await fetchAndMarkPendingBatch(campaignId, BATCH_SIZE);
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
      console.warn(`[ORCHESTRATOR] Nenhuma instância online. Aguardando ${NO_ACCOUNTS_MS / 60_000} min...`);
      await interruptibleSleep(NO_ACCOUNTS_MS);
      continue;
    }

    // ── Passo 5: Enfileira com delay + textos no payload ──────────────────
    const messages = batch.map((contact, i) => ({
      id:             contact.id,
      phone:          contact.phone,
      accountId:      online[i % online.length],
      texts,             // array completo viaja junto — worker sorteia na hora do envio
      delayFlexivelMs,   // cadenciamento calculado matematicamente
      type:           'text',
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

    sendCycleReport({ campaignId, wave, zapsCaidos }).catch(() => {});
    // fire-and-forget — falha no relatório não interrompe a campanha

    // ── Passo 7: Rotação de IP escalonada (fire-and-forget) ───────────────
    const activeZtes = getAllZteIds().filter((id) => ZTE_CONFIG[id].serial);
    if (activeZtes.length) {
      console.log(`[ORCHESTRATOR] Disparando rotação escalonada — ${activeZtes.length} ZTE(s).`);
      for (let i = 0; i < activeZtes.length; i++) {
        rotateIp(activeZtes[i]);
        console.log(`[ORCHESTRATOR] Rotação iniciada: ${activeZtes[i]}`);
        if (i < activeZtes.length - 1) await sleep(ROTATION_STAGGER_MS);
      }
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

  const opts = {
    durationHours: options.durationHours ?? 1,
    maxPerZap:     options.maxPerZap     ?? 30,
    zaps:          Array.isArray(options.zaps) ? options.zaps : [],
  };

  // Arma a campanha: converte 'importado' → 'pendente' (lista em repouso vira ativa)
  const armed = await armCampaign(campaignId);
  console.log(`[ORCHESTRATOR] Campanha "${campaignId}" armada — ${armed} contato(s) prontos.`);

  isCampaignRunning = true;
  stopRequested     = false;
  _activeCampaign   = {
    campaignId,
    texts,
    options: opts,
    startedAt: new Date().toISOString(),
  };

  console.log(
    `[ORCHESTRATOR] Iniciando campanha "${campaignId}" | ` +
    `${texts.length} texto(s) | ` +
    `Duração: ${opts.durationHours}h | ` +
    `Máx/Zap: ${opts.maxPerZap}`
  );

  runCampaignLoop(campaignId, texts, opts)
    .then(() =>  console.log(`[ORCHESTRATOR] Loop encerrado para "${campaignId}".`))
    .catch((err) => console.error(`[ORCHESTRATOR] Erro fatal:`, err.message))
    .finally(() => {
      isCampaignRunning = false;
      _activeCampaign   = null;
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
    campaign:      _activeCampaign,
    stopRequested,
  };
}
