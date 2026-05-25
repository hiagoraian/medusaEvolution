import { ZTE_CONFIG } from './network.config.js';

export function getAllNetworkStatus() {
  return Object.entries(ZTE_CONFIG).map(([zteId, config]) => ({
    zteId,
    serial:   config.serial ?? null,
    status:   config.serial ? 'configurado' : 'sem_serial',
    accounts: config.accounts,
  }));
}
