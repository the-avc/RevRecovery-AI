import { Router } from 'express';
import { generateMockData } from '../controllers/seed.controller';

export const seedRouter = Router();

seedRouter.post('/generate', generateMockData);
