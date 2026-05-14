import { exec as execCb } from 'child_process';
import { promisify }       from 'util';

const exec = promisify(execCb);

// ── Primitiva genérica ────────────────────────────────────────────────────────

export async function executeAdbCommand(serial, command, timeout = 15_000) {
  const adbCmd = `adb -s ${serial} ${command}`;

  try {
    const { stdout, stderr } = await exec(adbCmd, { timeout });

    // ADB às vezes escreve em stderr mesmo em sucesso (ex: "* daemon started")
    if (!stdout && stderr) {
      throw new Error(stderr.trim());
    }

    return stdout.trim();
  } catch (err) {
    // Normaliza: timeout, USB pull, dispositivo offline, etc.
    const reason = err.killed ? 'timeout' : (err.message ?? String(err));
    throw new Error(`[ADB] serial=${serial} cmd="${command}" → ${reason}`);
  }
}

// ── Modo avião ────────────────────────────────────────────────────────────────

export function enableAirplaneMode(serial) {
  return executeAdbCommand(serial, 'shell cmd connectivity airplane-mode enable');
}

export function disableAirplaneMode(serial) {
  return executeAdbCommand(serial, 'shell cmd connectivity airplane-mode disable');
}

// ── WiFi (fallback quando o 4G não volta) ─────────────────────────────────────

export function enableWifi(serial) {
  return executeAdbCommand(serial, 'shell svc wifi enable');
}

export function disableWifi(serial) {
  return executeAdbCommand(serial, 'shell svc wifi disable');
}

// ── Verificação de presença do hardware ───────────────────────────────────────

export async function checkConnection(serial, timeout = 5_000) {
  try {
    const out = await executeAdbCommand(serial, 'shell echo ok', timeout);
    return out === 'ok';
  } catch {
    return false;
  }
}

// ── Verificação de conectividade IP (ping via dispositivo) ────────────────────

export async function verifyIpConnectivity(serial) {
  try {
    // Tenta pingar o DNS público do Google a partir do dispositivo
    const out = await executeAdbCommand(
      serial,
      'shell ping -c 1 -W 5 8.8.8.8',
      12_000
    );
    // Diferentes versões do Android exibem o resultado de formas distintas
    return (
      out.includes('1 received') ||
      out.includes('1 packets received') ||
      out.includes('icmp_seq=0 ttl=')
    );
  } catch {
    return false;
  }
}
