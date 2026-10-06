import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 300000, // 5 minutes to allow batch processing of many transactions
});

export interface DashboardStats {
  totalAtRisk: number;
  totalRecovered: number;
  recoveryRate: number;
  totalTransactions: number;
  statusBreakdown: { status: string; _count: number; _sum: { amount: number } }[];
  failureTypeBreakdown: { failureType: string; _count: number; _sum: { amount: number } }[];
  recentRecoveries: Transaction[];
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  type: 'B2C' | 'B2B';
  company?: string;
}

export interface RecoveryAction {
  id: string;
  actionType: string;
  status: string;
  aiRootCause?: string;
  aiReasoning?: string;
  aiConfidence?: number;
  recoveryProb?: number;
  paymentLinkUrl?: string;
  voiceAudioPath?: string;
  executedAt?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  event: string;
  actor: string;
  details: object;
  transactionId?: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  customer: Customer;
  amount: number;
  status: string;
  failureType: string;
  errorCode?: string;
  errorDescription?: string;
  retryCount: number;
  recoveredAmount?: number;
  recoveredAt?: string;
  promisedPayDate?: string;
  recoveryActions?: RecoveryAction[];
  auditLogs?: AuditLog[];
  createdAt: string;
}

export interface TransactionListResponse {
  transactions: Transaction[];
  total: number;
  page: number;
  totalPages: number;
}

export interface BatchResult {
  success: boolean;
  message: string;
  processed: number;
  totalAtRisk: number;
  batchId: string;
}

export interface BatchRun {
  id: string;
  totalAtRisk: number;
  totalRecovered: number;
  transactionCount: number;
  recoveredCount: number;
  startedAt: string;
  completedAt?: string;
  status: string;
  actualRecovered: number;
}

// Dashboard
export const getStats = () => api.get<DashboardStats>('/dashboard/stats').then(r => r.data);

export const getTransactions = (params?: {
  page?: number;
  limit?: number;
  status?: string;
  failureType?: string;
}) => api.get<TransactionListResponse>('/dashboard/transactions', { params }).then(r => r.data);

export const getTransactionDetail = (id: string) =>
  api.get<Transaction>(`/dashboard/transactions/${id}`).then(r => r.data);

export const getAuditLogs = (params?: { page?: number; transactionId?: string }) =>
  api.get<{ logs: AuditLog[]; total: number }>('/dashboard/audit-logs', { params }).then(r => r.data);

// Agent
export const runBatchRecovery = () =>
  api.post<BatchResult>('/agent/run-batch').then(r => r.data);

export const getBatches = () =>
  api.get<BatchRun[]>('/agent/batches').then(r => r.data);

// Seed
export const generateMockData = (count = 50) =>
  api.post<{
    success: boolean;
    message: string;
    downloadUrl: string;
    csvPath?: string;
    created?: number;
    breakdown?: Record<string, number>;
  }>('/seed/generate', null, { params: { count } }).then(r => r.data);

export const downloadCSV = () => {
  const link = document.createElement('a');
  link.href = '/api/seed/download-csv';
  link.setAttribute('download', `generated_transactions_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};


// Payment
export const createRazorpayOrder = (data: { amount: number; transactionId?: string; receipt?: string }) =>
  api.post<{ success: boolean; order_id: string; amount: number; currency: string }>('/payment/create-order', data).then(r => r.data);

export const verifyRazorpayPayment = (data: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string; transactionId?: string }) =>
  api.post<{ success: boolean; message: string }>('/payment/verify-payment', data).then(r => r.data);
