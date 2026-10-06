import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { webhookRouter } from './routes/webhook.routes';
import { agentRouter } from './routes/agent.routes';
import { dashboardRouter } from './routes/dashboard.routes';
import { seedRouter } from './routes/seed.routes';
import { paymentRouter } from './routes/payment.routes';
import { startCronJobs } from './jobs/retry-sequencer';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Raw body parser for Razorpay webhook signature verification (accepts all content types)
app.use('/api/webhooks', express.raw({ type: '*/*' }));

// JSON parser for all other routes
app.use(express.json());

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

// Routes
app.use('/api/webhooks', webhookRouter);
app.use('/api/agent', agentRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/seed', seedRouter);
app.use('/api/payment', paymentRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Revenue Recovery Node Server running on http://localhost:${PORT}`);
  startCronJobs();
});

export default app;
