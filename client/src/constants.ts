// ─── Failure Types ──────────────────────────────────────────────────────────
export const FAILURE_LABELS: Record<string, string> = {
  PAYMENT_FAILED: 'Payment Failed',
  CHECKOUT_ABANDONED: 'Checkout Drop-off',
  SUBSCRIPTION_FAILED: 'Subscription Failure',
  INVOICE_OVERDUE: 'B2B Invoice Overdue',
  MANDATE_FAILED: 'Mandate Failed',
};

export const FAILURE_LABELS_SHORT: Record<string, string> = {
  PAYMENT_FAILED: 'Payment Failed',
  CHECKOUT_ABANDONED: 'Checkout Drop-off',
  SUBSCRIPTION_FAILED: 'Subscription',
  INVOICE_OVERDUE: 'B2B Invoice',
  MANDATE_FAILED: 'Mandate',
};

export const FAILURE_COLORS: Record<string, string> = {
  PAYMENT_FAILED: '#ef4444',
  CHECKOUT_ABANDONED: '#f59e0b',
  SUBSCRIPTION_FAILED: '#8b5cf6',
  INVOICE_OVERDUE: '#3b82f6',
  MANDATE_FAILED: '#ec4899',
};

// ─── Status ─────────────────────────────────────────────────────────────────
export const STATUS_COLORS: Record<string, string> = {
  FAILED: '#ef4444',
  IN_RECOVERY: '#f59e0b',
  RECOVERED: '#10b981',
  ABANDONED: '#6b7280',
  PROMISE_TO_PAY: '#3b82f6',
};

export const getStatusClasses = (status: string): string => {
  switch (status) {
    case 'FAILED':       return 'bg-red-500/15 text-red-400 border border-red-500/30';
    case 'IN_RECOVERY':  return 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
    case 'RECOVERED':    return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    case 'ABANDONED':    return 'bg-gray-500/15 text-gray-400 border border-gray-500/30';
    case 'PROMISE_TO_PAY': return 'bg-blue-500/15 text-blue-400 border border-blue-500/30';
    default:             return 'bg-gray-500/15 text-gray-400 border border-gray-500/30';
  }
};

// ─── Action Icons / Labels ───────────────────────────────────────────────────
export const ACTION_ICONS: Record<string, string> = {
  IMMEDIATE_RETRY_LINK:    '🔗',
  DELAYED_RETRY_LINK:      '⏰',
  DISCOUNT_OFFER:          '🏷️',
  B2B_REMINDER_EMAIL:      '📧',
  B2B_FIRM_EMAIL:          '📩',
  B2B_ESCALATION_EMAIL:    '🚨',
  HINGLISH_VOICE_CALL:     '🎙️',
  MANDATE_RETRY:           '🔄',
  PROMISE_TO_PAY_FOLLOWUP: '🤝',
  NO_ACTION:               '🚫',
};

export const ACTION_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  IMMEDIATE_RETRY_LINK:    { label: '🔗 Immediate Retry Link',      color: 'text-violet-400',  bg: 'bg-violet-500/15',  border: 'border-violet-500/30' },
  DELAYED_RETRY_LINK:      { label: '⏰ Delayed Retry Link',        color: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/30'  },
  DISCOUNT_OFFER:          { label: '🏷️ Discount Offer',            color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30'},
  B2B_REMINDER_EMAIL:      { label: '📧 B2B Reminder Email',        color: 'text-blue-400',    bg: 'bg-blue-500/15',    border: 'border-blue-500/30'   },
  B2B_FIRM_EMAIL:          { label: '📩 B2B Firm Email',            color: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/30'  },
  B2B_ESCALATION_EMAIL:    { label: '🚨 B2B Escalation',            color: 'text-red-400',     bg: 'bg-red-500/15',     border: 'border-red-500/30'    },
  HINGLISH_VOICE_CALL:     { label: '🎙️ Hinglish Voice Call',       color: 'text-pink-400',    bg: 'bg-pink-500/15',    border: 'border-pink-500/30'   },
  MANDATE_RETRY:           { label: '🔄 Mandate Retry',             color: 'text-violet-400',  bg: 'bg-violet-500/15',  border: 'border-violet-500/30' },
  PROMISE_TO_PAY_FOLLOWUP: { label: '🤝 Promise to Pay Follow-up',  color: 'text-blue-400',    bg: 'bg-blue-500/15',    border: 'border-blue-500/30'   },
  NO_ACTION:               { label: '🚫 No Action (Fraud/Low Prob)', color: 'text-gray-400',   bg: 'bg-gray-500/15',    border: 'border-gray-500/30'   },
};

// ─── Shared Card Styles ──────────────────────────────────────────────────────
export const cardBase =
  'bg-[#0d0d1f] border border-[rgba(139,92,246,0.15)] rounded-2xl transition-all duration-300 hover:border-violet-500/40 hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(124,58,237,0.15)]';

export const btnPrimary =
  'bg-gradient-to-br from-violet-600 to-purple-800 text-white px-6 py-3 rounded-xl font-semibold inline-flex items-center gap-2 transition-all duration-300 hover:from-violet-500 hover:to-purple-700 hover:-translate-y-0.5 hover:shadow-[0_8px_25px_rgba(124,58,237,0.4)] active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none';

export const btnGhost =
  'bg-violet-500/10 text-violet-400 border border-violet-500/30 px-6 py-3 rounded-xl font-semibold inline-flex items-center gap-2 transition-all duration-300 hover:bg-violet-500/20 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none';
