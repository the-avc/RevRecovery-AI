import { Router } from 'express';
import { getStats, getTransactions, getAuditLogs, getTransactionDetail } from '../controllers/dashboard.controller';

export const dashboardRouter = Router();

dashboardRouter.get('/stats', getStats);
dashboardRouter.get('/transactions', getTransactions);
dashboardRouter.get('/transactions/:id', getTransactionDetail);
dashboardRouter.get('/audit-logs', getAuditLogs);
