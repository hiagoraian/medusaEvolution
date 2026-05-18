import { createInstance, fetchInstanceState, reconnectInstance, logoutInstance, deleteInstance, fetchGroups } from './evolution.client.js';
import {
  saveConnectData, getConnectData, isInstanceOnline, listInstanceStatuses,
  setInstanceOnline, setInstanceOffline, deleteConnectData, isExplicitlyOffline,
} from './cache.service.js';
import { resolveProxy } from './proxy.service.js';
import { ZTE_CONFIG } from '../network/network.config.js';

// Chama reconnect e salva o QR do response HTTP direto (fallback caso webhook não chegue)
async function doReconnectAndSaveQr(accountId) {
  const data = await reconnectInstance(accountId);
  const b64 = data?.base64 ?? data?.qrcode?.base64 ?? null;
  const pairingCode = data?.code ?? data?.pairingCode ?? data?.qrcode?.code ?? null;
  if (b64) {
    await saveConnectData(accountId, { base64: b64, pairingCode });
    console.log(`[DEBUG] QR salvo do response direto de reconnect — "${accountId}"`);
  }
  return data;
}

// Todos os 49 IDs conhecidos (48 campanha + admin)
const ALL_ACCOUNT_IDS = [
  ...Object.values(ZTE_CONFIG).flatMap((z) => z.accounts),
  'WA-49',
];

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
      console.warn(`[DEBUG] "${accountId}" — ghost connection detectada (Evolution=open, Redis=close). Forçando reconexão...`);
      try {
        await logoutInstance(accountId).catch(() => {});
        await doReconnectAndSaveQr(accountId);
        return res.json({ message: 'Reconexão forçada — aguardando QR Code.', ghostFixed: true });
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

// GET /api/whatsapp/instances — retorna todos os 49 ZAPs com status do Redis
export async function getInstances(_req, res) {
  try {
    const statuses = await Promise.all(
      ALL_ACCOUNT_IDS.map(async (id) => ({
        id,
        online:  await isInstanceOnline(id),
        isAdmin: id === 'WA-49',
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

  if (accountId === 'WA-49') {
    return res.status(403).json({ error: 'Não é possível excluir o admin (WA-49).' });
  }

  console.log(`[IDENTITY] Excluindo instância "${accountId}"...`);

  // Passo 1: Logout primeiro — força Evolution a mudar estado de 'open' → 'close'
  // antes do delete, o que aumenta a chance de o delete ser aceito.
  try {
    await logoutInstance(accountId);
    console.log(`[IDENTITY] "${accountId}" deslogada antes da exclusão.`);
  } catch {
    // Ignorado — instância pode não estar conectada; prossegue para o delete
  }

  // Passo 2: Delete
  try {
    await deleteInstance(accountId);
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
