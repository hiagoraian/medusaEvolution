import { Router }                           from 'express';
import {
  startHandler, stopHandler, statusHandler, purgeHandler,
  recoveryStatusHandler, recoverHandler, cancelRecoveryHandler,
} from './orchestrator.controller.js';

const router = Router();

router.post('/start',      startHandler);            // POST   /api/orchestrator/start
router.post('/stop',       stopHandler);             // POST   /api/orchestrator/stop
router.get('/status',      statusHandler);           // GET    /api/orchestrator/status
router.post('/purge',      purgeHandler);            // POST   /api/orchestrator/purge
router.get('/recovery',    recoveryStatusHandler);   // GET    /api/orchestrator/recovery
router.post('/recover',    recoverHandler);          // POST   /api/orchestrator/recover
router.delete('/recovery', cancelRecoveryHandler);   // DELETE /api/orchestrator/recovery

export default router;
