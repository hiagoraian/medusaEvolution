import { Router }    from 'express';
import { testShoot } from './outbound.controller.js';

const router = Router();

router.post('/test-shoot', testShoot);  // POST /api/campaign/test-shoot

export default router;
