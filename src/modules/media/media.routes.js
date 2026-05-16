import { Router }        from 'express';
import { uploadMedia }   from './media.controller.js';
import { mediaUpload }   from './media.controller.js';

const router = Router();

router.post('/upload', mediaUpload.single('file'), uploadMedia);

export default router;
