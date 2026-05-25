import { getAllNetworkStatus } from './network.service.js';

// GET /api/network/status
export function getNetworkStatus(_req, res) {
  const devices = getAllNetworkStatus();
  return res.json({ ts: new Date().toISOString(), devices });
}
