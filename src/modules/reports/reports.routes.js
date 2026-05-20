import { Router }                                                                      from 'express';
import { dashboardHandler, historyHandler, exportHandler,
         zapStatsHandler, zapStatsResetHandler, clearAllHandler }                      from './reports.controller.js';

const router = Router();

router.get('/dashboard',                        dashboardHandler);
router.get('/history',                          historyHandler);
router.get('/export/:campaignId/:status',       exportHandler);
router.get('/zap-stats',                        zapStatsHandler);
router.post('/zap-stats/:accountId/reset',      zapStatsResetHandler);
router.delete('/clear-all',                     clearAllHandler);

export default router;
