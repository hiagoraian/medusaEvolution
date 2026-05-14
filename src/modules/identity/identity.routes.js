import { Router } from 'express';
import {
  startInstance, getQrCode, getInstances,
  disconnectInstanceHandler, deleteInstanceHandler,
  getGroupsHandler,
} from './identity.controller.js';

const router = Router();

router.post  ('/start',                    startInstance);
router.get   ('/qrcode/:accountId',        getQrCode);
router.get   ('/instances',               getInstances);
router.get   ('/groups/:accountId',       getGroupsHandler);
router.post  ('/disconnect/:accountId',   disconnectInstanceHandler);
router.delete('/:accountId',              deleteInstanceHandler);

export default router;
