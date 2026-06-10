import { ZTE_CONFIG } from './network.config.js';

export function getAllNetworkStatus() {
  return Object.entries(ZTE_CONFIG).map(([zteId, config]) => ({
    zteId,
    proxy:    config.proxyUrl ?? null,
    accounts: config.accounts,
  }));
}
