import { Router } from 'express';
import { listGroups } from './inbound.controller.js';

const router = Router();

// GET /api/inbound/groups/:accountId
router.get('/groups/:accountId', listGroups);

export default router;
