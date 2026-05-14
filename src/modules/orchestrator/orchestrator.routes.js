import { Router }                           from 'express';
import { startHandler, stopHandler, statusHandler } from './orchestrator.controller.js';

const router = Router();

router.post('/start',  startHandler);   // POST /api/orchestrator/start
router.post('/stop',   stopHandler);    // POST /api/orchestrator/stop
router.get('/status',  statusHandler);  // GET  /api/orchestrator/status

export default router;
