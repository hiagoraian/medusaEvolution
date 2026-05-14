import { Router }                                from 'express';
import { getConfigHandler, updateConfigHandler } from './warmup.controller.js';

const router = Router();

router.get('/config',  getConfigHandler);
router.post('/config', updateConfigHandler);

export default router;
