import { Router }                  from 'express';
import { handleEvolutionWebhook } from './webhook.controller.js';

const router = Router();

// Montado em /webhook/evolution no server.js → POST /webhook/evolution
router.post('/', handleEvolutionWebhook);

export default router;
