import { Router } from 'express';
import {
  getStats,
  getTransactions,
  getAuditLogs,
  getTransactionDetail,
  recordPromiseToPay,
  retryRecovery,
} from '../controllers/dashboard.controller';

export const dashboardRouter = Router();

dashboardRouter.get('/stats', getStats);
dashboardRouter.get('/transactions', getTransactions);
dashboardRouter.get('/transactions/:id', getTransactionDetail);
dashboardRouter.post('/transactions/:id/promise', recordPromiseToPay);
dashboardRouter.post('/transactions/:id/recover', retryRecovery);
dashboardRouter.get('/audit-logs', getAuditLogs);
