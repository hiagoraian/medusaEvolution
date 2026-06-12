import { createInstance, fetchInstanceState, reconnectInstance, logoutInstance, restartInstance, deleteInstance, fetchGroups, setInstanceProxy, removeInstanceProxy } from './evolution.client.js';
import {
  saveConnectData, getConnectData, isInstanceOnline, listInstanceStatuses,
  setInstanceOnline, setInstanceOffline, deleteConnectData, isExplicitlyOffline,
} from './cache.service.js';
import { resolveProxy, buildProxyConfig } from './proxy.service.js';
import { ZTE_CONFIG } from '../network/network.config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Chama reconnect e salva o QR do response HTTP direto (fallback caso webhook não chegue)
async function doReconnectAndSaveQr(accountId) {
  const data = await reconnectInstance(accountId);
  const b64 = data?.base64 ?? data?.qrcode?.base64 ?? null;
  const pairingCode = data?.code ?? data?.pairingCode ?? data?.qrcode?.code ?? null;
  if (b64) {
    await saveConnectData(accountId, { base64: b64, pairingCode });
    console.log(`[DEBUG] QR salvo do response direto de reconnect — "${accountId}"`);
  } else {
    console.log(`[DEBUG] Sem QR no response HTTP de reconnect — "${accountId}" | ${JSON.stringify(data)?.slice(0, 200)}`);
  }
  return data;
}

const ALL_ACCOUNT_IDS = Object.values(ZTE_CONFIG).flatMap((z) => z.accounts);

// POST /api/whatsapp/start
export async function startInstance(req, res) {
  console.log('[API] Requisição recebida para iniciar Zap:', req.body);
  const { accountId } = req.body;

  if (!accountId) {
    return res.status(400).json({ error: 'accountId é obrigatório.' });
  }

  // ── Passo 1: Verifica estado atual (read-only, sem efeitos colaterais) ────────
  const state = await fetchInstanceState(accountId);
  console.log(`[DEBUG] Estado de "${accountId}" na Evolution: ${state ?? 'não existe'}`);

  // Já conectada → verifica se não é uma ghost connection antes de sincronizar
  if (state === 'open') {
    const ghostSuspect = await isExplicitlyOffline(accountId);
    if (ghostSuspect) {
      // Redis foi explicitamente marcado offline (Connection Closed ou delete anterior)
      // mas Evolution ainda reporta 'open' — é uma conexão fantasma.
      // Forçamos logout + reconexão para gerar novo QR.
      console.warn(`[DEBUG] "${accountId}" — ghost connection detectada (Evolution=open, Redis=close). Recriando instância...`);
      try {
        // 1. Restart — quebra o websocket travado antes de qualquer outra operação
        await restartInstance(accountId).catch((e) =>
          console.warn(`[DEBUG] ghost restart "${accountId}" ignorado: ${e.response?.data?.message ?? e.message}`)
        );
        await sleep(3_000);
        // 2. Logout — força state open → close
        await logoutInstance(accountId).catch((e) =>
          console.warn(`[DEBUG] ghost logout "${accountId}" ignorado: ${e.response?.data?.message ?? e.message}`)
        );
        await sleep(1_000);
        // 3. Force delete — ?ignoreWhatsapp=true bypassa a restrição de estado open
        await deleteInstance(accountId, true).catch((e) =>
          console.warn(`[DEBUG] ghost delete "${accountId}" ignorado: ${e.response?.data?.message ?? e.message}`)
        );
        await sleep(1_000);
        // 4. Recria do zero com proxy
        const proxyConfig = await resolveProxy(accountId);
        await createInstance(accountId, proxyConfig).catch((e) =>
          console.warn(`[DEBUG] ghost create "${accountId}" ignorado: ${e.response?.data?.message ?? e.message}`)
        );
        // 5. Gera QR via connect
        await doReconnectAndSaveQr(accountId);
        return res.json({ message: 'Ghost corrigido — instância recriada, aguardando QR Code.', ghostFixed: true });
      } catch (err) {
        const detail = err.response?.data ?? err.message;
        console.error(`[DEBUG] Falha ao corrigir ghost de "${accountId}":`, detail);
        return res.status(500).json({ error: 'Falha ao reconectar instância ghost.', detail });
      }
    }
    await setInstanceOnline(accountId);
    console.log(`[DEBUG] "${accountId}" já está online — Redis sincronizado.`);
    return res.json({ message: 'Instância já conectada.', alreadyConnected: true });
  }

  // ── Passo 2: Existe mas não conectada → gera novo QR via reconnect ───────────
  if (state !== null) {
    try {
      console.log(`[DEBUG] "${accountId}" existe (${state}) — acionando reconexão...`);
      // Proxy não pode ser injetado no reconnect (GET sem body) — Evolution usa o
      // proxy armazenado na instância desde a criação. Loga aviso se estiver caído.
      resolveProxy(accountId).then((p) => {
        if (p === null && (process.env.EVOLUTION_PROXIES ?? '')) {
          // resolveProxy já logou o aviso individualmente
        }
      }).catch(() => {});
      await doReconnectAndSaveQr(accountId);
      console.log(`[DEBUG] Reconexão de "${accountId}" acionada.`);
      return res.json({ message: 'Reconexão acionada, aguardando QR Code via webhook.' });
    } catch (reconnErr) {
      const detail = reconnErr.response?.data ?? reconnErr.message;
      console.error(`[DEBUG] Falha ao reconectar "${accountId}":`, detail);
      return res.status(500).json({ error: 'Falha ao reconectar instância.', detail });
    }
  }

  // ── Passo 3: Não existe → criar instância nova (com proxy se disponível) ──────
  try {
    const proxyConfig = await resolveProxy(accountId);
    const data = await createInstance(accountId, proxyConfig);
    console.log(`[DEBUG] Instância "${accountId}" criada — Evolution: ${JSON.stringify(data).slice(0, 120)}`);
    // Evolution API v2 não inicia o QR automaticamente no create — é necessário chamar connect.
    await doReconnectAndSaveQr(accountId);
    console.log(`[DEBUG] Conexão iniciada para "${accountId}" — aguardando QR via webhook.`);
    return res.json({ message: 'Processando conexão via webhook' });
  } catch (err) {
    const httpStatus = err.response?.status;
    const errBody    = JSON.stringify(err.response?.data ?? err.message);
    console.error(`[DEBUG] Erro ao criar "${accountId}": ${httpStatus} — ${errBody.slice(0, 300)}`);

    // Fallback: qualquer erro 4xx → a instância pode estar em estado parcial; tenta reconnect
    const shouldReconnect = httpStatus === 400 || httpStatus === 403 || httpStatus === 409 || httpStatus === 422;

    if (shouldReconnect) {
      try {
        console.log(`[DEBUG] Fallback: acionando reconexão de "${accountId}"...`);
        await doReconnectAndSaveQr(accountId);
        console.log(`[DEBUG] Reconexão (fallback) de "${accountId}" acionada.`);
        return res.json({ message: 'Reconexão acionada, aguardando QR Code via webhook.' });
      } catch (reconnErr) {
        const detail = reconnErr.response?.data ?? reconnErr.message;
        console.error(`[DEBUG] Fallback falhou para "${accountId}":`, detail);
        return res.status(500).json({ error: 'Falha ao reconectar instância.', detail });
      }
    }

    return res.status(httpStatus ?? 500).json({ error: 'Falha ao criar instância.', detail: err.response?.data ?? err.message });
  }
}

// GET /api/whatsapp/instances — retorna todos os 48 ZAPs com status do Redis
export async function getInstances(_req, res) {
  try {
    const statuses = await Promise.all(
      ALL_ACCOUNT_IDS.map(async (id) => ({
        id,
        online: await isInstanceOnline(id),
      }))
    );
    return res.json(statuses);
  } catch (err) {
    console.error('[IDENTITY] Erro ao listar instâncias:', err.message);
    return res.status(500).json({ error: 'Falha ao listar instâncias.' });
  }
}

// POST /api/whatsapp/disconnect/:accountId
export async function disconnectInstanceHandler(req, res) {
  const { accountId } = req.params;

  console.log(`[IDENTITY] Desconectando instância "${accountId}"...`);

  try {
    await logoutInstance(accountId);
    console.log(`[IDENTITY] "${accountId}" deslogada da Evolution API.`);
  } catch (err) {
    console.warn(`[IDENTITY] Evolution retornou erro ao deslogar "${accountId}":`, err.response?.data ?? err.message);
  }

  await Promise.allSettled([
    setInstanceOffline(accountId),
    deleteConnectData(accountId),
  ]);

  return res.json({ status: 'ok', disconnected: accountId });
}

// DELETE /api/whatsapp/:accountId
export async function deleteInstanceHandler(req, res) {
  const { accountId } = req.params;

  console.log(`[IDENTITY] Excluindo instância "${accountId}"...`);

  // Passo 1: Logout primeiro — força Evolution a mudar estado de 'open' → 'close'
  // antes do delete, o que aumenta a chance de o delete ser aceito.
  try {
    await logoutInstance(accountId);
    console.log(`[IDENTITY] "${accountId}" deslogada antes da exclusão.`);
  } catch {
    // Ignorado — instância pode não estar conectada; prossegue para o delete
  }

  // Passo 2: Delete com force=true — ignora estado open/close na Evolution
  try {
    await deleteInstance(accountId, true);
    console.log(`[IDENTITY] "${accountId}" removida da Evolution API.`);
  } catch (err) {
    // Mesmo que a Evolution falhe, limpa o Redis (instância some do painel)
    console.warn(`[IDENTITY] Evolution retornou erro ao excluir "${accountId}":`, err.response?.data ?? err.message);
  }

  // Passo 3: Limpa Redis sempre
  await Promise.allSettled([
    setInstanceOffline(accountId),
    deleteConnectData(accountId),
  ]);

  return res.json({ status: 'ok', deleted: accountId });
}

// POST /api/whatsapp/apply-proxies
// Aplica o proxy correto em todos os ZAPs com base no ZTE_CONFIG + .env
export async function applyProxiesHandler(_req, res) {
  const results = { success: [], failed: [], skipped: [] };

  const entries = Object.entries(ZTE_CONFIG);

  for (const [zteId, config] of entries) {
    if (!config.proxyUrl) {
      results.skipped.push(...config.accounts.map((id) => ({ id, reason: `${zteId} sem proxy configurado no .env` })));
      continue;
    }

    const proxyConfig = buildProxyConfig(config.proxyUrl);
    if (!proxyConfig) {
      results.skipped.push(...config.accounts.map((id) => ({ id, reason: `URL de proxy inválida: ${config.proxyUrl}` })));
      continue;
    }

    for (const accountId of config.accounts) {
      try {
        await setInstanceProxy(accountId, proxyConfig);
        console.log(`[PROXY] ${accountId} → ${config.proxyUrl} ✓`);
        results.success.push(accountId);
      } catch (err) {
        const reason = err.response?.data?.response?.message?.[0] ?? err.response?.data?.error ?? err.message;
        console.warn(`[PROXY] ${accountId} falhou: ${reason}`);
        results.failed.push({ id: accountId, reason });
      }
    }
  }

  console.log(`[PROXY] Bulk apply concluído — ✓ ${results.success.length} | ✗ ${results.failed.length} | skip ${results.skipped.length}`);
  return res.json(results);
}

// POST /api/whatsapp/remove-proxies
// Remove (desativa) o proxy de todos os ZAPs WA-01..WA-48
export async function removeProxiesHandler(_req, res) {
  const allAccounts = Object.values(ZTE_CONFIG).flatMap((z) => z.accounts);
  const results = { success: [], failed: [] };

  for (const accountId of allAccounts) {
    try {
      await removeInstanceProxy(accountId);
      console.log(`[PROXY] ${accountId} → proxy removido ✓`);
      results.success.push(accountId);
    } catch (err) {
      const reason = err.response?.data?.response?.message?.[0] ?? err.response?.data?.error ?? err.message;
      console.warn(`[PROXY] ${accountId} falhou ao remover proxy: ${reason}`);
      results.failed.push({ id: accountId, reason });
    }
  }

  console.log(`[PROXY] Remove bulk concluído — ✓ ${results.success.length} | ✗ ${results.failed.length}`);
  return res.json(results);
}

// GET /api/whatsapp/groups/:accountId
export async function getGroupsHandler(req, res) {
  const { accountId } = req.params;
  try {
    const groups = await fetchGroups(accountId);
    return res.json(Array.isArray(groups) ? groups : []);
  } catch (err) {
    console.error(`[IDENTITY] Erro ao buscar grupos de "${accountId}":`, err.message);
    return res.status(500).json({ error: 'Falha ao buscar grupos.', detail: err.response?.data ?? err.message });
  }
}

// GET /api/whatsapp/qrcode/:accountId
export async function getQrCode(req, res) {
  const { accountId } = req.params;

  try {
    const [connectData, online] = await Promise.all([
      getConnectData(accountId),
      isInstanceOnline(accountId),
    ]);

    console.log(`[DEBUG] QR poll "${accountId}" — online:${online} | connectData:${connectData ? 'presente' : 'nulo'}`);

    // Sem QR no Redis = instância ainda inicializando (ou já conectou e o Redis foi limpo)
    // O frontend usa o 404 para saber que deve continuar aguardando
    if (!connectData) {
      return res.status(404).json({ error: 'QR Code ainda não disponível.' });
    }

    return res.json({ online, connectData });
  } catch (err) {
    console.error(`[DEBUG] Erro ao ler cache para "${accountId}":`, err.message);
    return res.status(500).json({ error: 'Falha ao ler cache.' });
  }
}
