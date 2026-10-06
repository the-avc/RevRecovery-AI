import { Router } from 'express';
import { generateMockData, downloadGeneratedCSV } from '../controllers/seed.controller';

export const seedRouter = Router();

seedRouter.post('/generate', generateMockData);
seedRouter.get('/download-csv', downloadGeneratedCSV);
