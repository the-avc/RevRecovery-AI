import { Router } from 'express';
import { runBatch, getBatches } from '../controllers/agent.controller';

export const agentRouter = Router();

agentRouter.post('/run-batch', runBatch);
agentRouter.get('/batches', getBatches);
