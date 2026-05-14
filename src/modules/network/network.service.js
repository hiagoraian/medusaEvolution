import axios from 'axios';
import {
  checkConnection,
  enableAirplaneMode,
  disableAirplaneMode,
  enableWifi,
  verifyIpConnectivity,
} from './adb.service.js';
import { ZTE_CONFIG } from './network.config.js';

// ── Helpers internos ──────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Delay aleatório entre 60-90s para evitar rotações sincronizadas em vários ZTEs
const randomReconnectDelay = () => Math.floor(Math.random() * 30_000) + 60_000;

// Guarda ZTEs com rotação em andamento — impede chamadas concorrentes no mesmo hardware
const _rotatingAt = new Map();

// ── Validação via proxy (opcional) ────────────────────────────────────────────

async function checkProxyConnectivity(proxyUrl) {
  if (!proxyUrl) return null; // proxy não configurado — pula validação

  try {
    const url    = new URL(proxyUrl);
    const target = 'http://httpbin.org/ip';

    await axios.get(target, {
      proxy:   { host: url.hostname, port: Number(url.port) },
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

// ── Rotação principal ─────────────────────────────────────────────────────────

export async function rotateIp(zteId) {
  const config = ZTE_CONFIG[zteId];

  if (!config) {
    return { success: false, zteId, reason: `ZTE desconhecido: "${zteId}"` };
  }

  if (!config.serial) {
    return { success: false, zteId, reason: `Serial não configurado para ${zteId}. Defina ZTE_${zteId.slice(-1)}_SERIAL no .env.` };
  }

  // ── Guarda de concorrência ────────────────────────────────────────────────
  if (_rotatingAt.has(zteId)) {
    const since = _rotatingAt.get(zteId);
    return {
      success: false,
      zteId,
      reason: `Rotação já em andamento desde ${since.toISOString()}`,
    };
  }

  _rotatingAt.set(zteId, new Date());
  const { serial, proxyUrl } = config;

  try {
    console.log(`[NETWORK] ${zteId} (${serial}): iniciando rotação de IP.`);

    // ── Passo 1: Verifica presença do hardware ─────────────────────────────
    const hardwareOk = await checkConnection(serial);
    if (!hardwareOk) {
      return {
        success: false,
        zteId,
        reason: `Hardware ${serial} não responde ao ADB. Verifique o cabo USB.`,
      };
    }
    console.log(`[NETWORK] ${zteId}: hardware OK.`);

    // ── Passo 2: Ativa modo avião ──────────────────────────────────────────
    await enableAirplaneMode(serial);
    console.log(`[NETWORK] ${zteId}: modo avião ON.`);

    // ── Passo 3: Aguarda descarte da sessão pela operadora (30s fixos) ─────
    console.log(`[NETWORK] ${zteId}: aguardando 30s para descarte de sessão CGNAT...`);
    await sleep(30_000);

    // ── Passo 4: Desativa modo avião ───────────────────────────────────────
    await disableAirplaneMode(serial);
    console.log(`[NETWORK] ${zteId}: modo avião OFF.`);

    // ── Passo 5: Aguarda negociação com a torre 4G (60–90s aleatório) ──────
    const reconnectDelay = randomReconnectDelay();
    console.log(`[NETWORK] ${zteId}: aguardando ${Math.round(reconnectDelay / 1000)}s para reconexão 4G...`);
    await sleep(reconnectDelay);

    // ── Passo 6: Verifica se a internet voltou ─────────────────────────────
    const ipOk    = await verifyIpConnectivity(serial);
    const proxyOk = await checkProxyConnectivity(proxyUrl);

    if (ipOk) {
      console.log(`[NETWORK] ${zteId}: 4G reconectado com sucesso.` + (proxyOk === true ? ' Proxy validado.' : ''));
      return { success: true, zteId, serial, proxyValidated: proxyOk };
    }

    // ── Passo 7 (Fallback): 4G não voltou — ativa WiFi do comutador ───────
    console.warn(`[NETWORK] ${zteId}: 4G não reconectou — ativando fallback WiFi.`);
    await enableWifi(serial);
    await sleep(8_000); // aguarda associação WiFi

    const wifiOk = await verifyIpConnectivity(serial);

    if (wifiOk) {
      console.log(`[NETWORK] ${zteId}: conectado via WiFi (fallback ativo).`);
      return { success: true, zteId, serial, fallback: 'wifi', proxyValidated: proxyOk };
    }

    // Sem conectividade de forma alguma
    console.error(`[NETWORK] ${zteId}: sem conectividade após rotação (4G e WiFi falharam).`);
    return {
      success: false,
      zteId,
      serial,
      reason: 'Sem conectividade após rotação. Verificar hardware e cobertura.',
    };

  } catch (err) {
    console.error(`[NETWORK] ${zteId}: erro inesperado durante rotação:`, err.message);
    return { success: false, zteId, serial, reason: err.message };
  } finally {
    _rotatingAt.delete(zteId);
  }
}

// ── Status de todos os ZTEs ───────────────────────────────────────────────────

export async function getAllNetworkStatus() {
  const checks = Object.entries(ZTE_CONFIG).map(async ([zteId, config]) => {
    if (!config.serial) {
      return { zteId, serial: null, status: 'sem_serial' };
    }

    const responding = await checkConnection(config.serial, 5_000);
    return {
      zteId,
      serial:   config.serial,
      status:   responding ? 'online' : 'offline',
      rotating: _rotatingAt.has(zteId),
      accounts: config.accounts,
    };
  });

  // allSettled garante que uma falha de ADB não impede as outras verificações
  const results = await Promise.allSettled(checks);
  return results.map((r) => (r.status === 'fulfilled' ? r.value : { error: r.reason?.message }));
}
