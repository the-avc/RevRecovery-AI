import { Router } from 'express';
import { createOrder, verifyPayment } from '../controllers/payment.controller';

export const paymentRouter = Router();

paymentRouter.post('/create-order', createOrder);
paymentRouter.post('/verify-payment', verifyPayment);
