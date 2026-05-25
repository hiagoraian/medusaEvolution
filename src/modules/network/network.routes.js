import { Router }           from 'express';
import { getNetworkStatus } from './network.controller.js';

const router = Router();

router.get('/status', getNetworkStatus); // GET /api/network/status

export default router;
