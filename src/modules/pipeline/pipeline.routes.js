import { Router } from 'express';
import {
  upload,
  uploadPipeline,
  listCampaigns,
  mergeCampaigns,
  splitCampaign,
  toggleCampaign,
  resetCampaign,
  deleteCampaign,
  getContacts,
  addContacts,
  removeContact,
} from './pipeline.controller.js';

const router = Router();

router.post  ('/upload',               upload.single('file'), uploadPipeline);
router.get   ('/lists',                listCampaigns);
router.post  ('/merge',                mergeCampaigns);
router.post  ('/split',                splitCampaign);
router.patch ('/lists/:listId/toggle', toggleCampaign);

// Rotas de edição (antes de /:id para evitar colisão)
router.get   ('/:id/contacts',         getContacts);
router.post  ('/:id/contacts',         addContacts);
router.delete('/:id/contacts',         removeContact);
router.post  ('/:id/reset',            resetCampaign);

router.delete('/:id',                  deleteCampaign);

export default router;
