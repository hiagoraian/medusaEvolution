// Shim de compatibilidade — config migrou para warmup.repository.js (persistência em banco)
export { getWarmupSettings as getWarmupConfig } from './warmup.repository.js';
