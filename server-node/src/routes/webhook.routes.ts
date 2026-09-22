import { Router } from 'express';
import { handleRazorpayWebhook } from '../controllers/webhook.controller';

export const webhookRouter = Router();

webhookRouter.post('/razorpay', handleRazorpayWebhook);
