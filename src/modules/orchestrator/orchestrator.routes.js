import { Router }                           from 'express';
import { startHandler, stopHandler, statusHandler, purgeHandler } from './orchestrator.controller.js';

const router = Router();

router.post('/start',  startHandler);   // POST /api/orchestrator/start
router.post('/stop',   stopHandler);    // POST /api/orchestrator/stop
router.get('/status',  statusHandler);  // GET  /api/orchestrator/status
router.post('/purge',  purgeHandler);   // POST /api/orchestrator/purge

export default router;
