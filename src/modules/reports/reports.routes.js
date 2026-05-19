import { Router }                                                                      from 'express';
import { dashboardHandler, historyHandler, exportHandler,
         zapStatsHandler, zapStatsResetHandler }                                       from './reports.controller.js';

const router = Router();

router.get('/dashboard',                        dashboardHandler);
router.get('/history',                          historyHandler);
router.get('/export/:campaignId/:status',       exportHandler);
router.get('/zap-stats',                        zapStatsHandler);
router.post('/zap-stats/:accountId/reset',      zapStatsResetHandler);

export default router;
