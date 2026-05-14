import { Router }                                          from 'express';
import { dashboardHandler, historyHandler, exportHandler } from './reports.controller.js';

const router = Router();

router.get('/dashboard',                  dashboardHandler);
router.get('/history',                    historyHandler);
router.get('/export/:campaignId/:status', exportHandler);

export default router;
