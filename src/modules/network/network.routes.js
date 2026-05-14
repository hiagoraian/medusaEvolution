import { Router }                          from 'express';
import { getNetworkStatus, triggerRotate } from './network.controller.js';

const router = Router();

router.get('/status',          getNetworkStatus);   // GET  /api/network/status
router.post('/rotate/:zteId',  triggerRotate);      // POST /api/network/rotate/:zteId

export default router;
