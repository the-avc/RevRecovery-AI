import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTransactions } from '../api';
import type { Transaction } from '../api';
import { format } from 'date-fns';
import { Filter } from 'lucide-react';
import { ACTION_ICONS, cardBase } from '../constants';
import { StatusBadge, FailureBadge } from '../components/ui/Badge';
import Pagination from '../components/ui/Pagination';

export default function TransactionsPage() {
  const [data, setData] = useState<{ transactions: Transaction[]; total: number; totalPages: number }>({
    transactions: [], total: 0, totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    getTransactions({ page, limit: 20, status: statusFilter || undefined, failureType: typeFilter || undefined })
      .then(res => { setData(res); setLoading(false); })
      .catch(() => setLoading(false));
  }, [page, statusFilter, typeFilter]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

  const selectClass =
    'bg-[#0d0d1f] border border-[rgba(139,92,246,0.2)] text-[#f0f0ff] px-4 py-2.5 rounded-xl text-sm cursor-pointer outline-none focus:border-violet-500 transition-colors hover:border-violet-500/40';

  return (
    <div className="px-6 sm:px-8 lg:px-10 py-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-7">
        <h1 className="text-2xl sm:text-3xl font-extrabold font-space mb-1.5 text-[#f0f0ff]">
          Transactions
        </h1>
        <p className="text-[#8b8baf]">
          {data.total} transactions across all failure types
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <div className="flex items-center gap-2 text-[#8b8baf] text-sm">
          <Filter size={15} />
          <span>Filter:</span>
        </div>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className={selectClass}
        >
          <option value="">All Statuses</option>
          <option value="FAILED">Failed</option>
          <option value="IN_RECOVERY">In Recovery</option>
          <option value="RECOVERED">Recovered</option>
          <option value="ABANDONED">Abandoned</option>
          <option value="PROMISE_TO_PAY">Promise to Pay</option>
        </select>

        <select
          value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          className={selectClass}
        >
          <option value="">All Failure Types</option>
          <option value="PAYMENT_FAILED">Payment Failed</option>
          <option value="CHECKOUT_ABANDONED">Checkout Drop-off</option>
          <option value="SUBSCRIPTION_FAILED">Subscription</option>
          <option value="INVOICE_OVERDUE">B2B Invoice</option>
          <option value="MANDATE_FAILED">Mandate</option>
        </select>

        {(statusFilter || typeFilter) && (
          <button
            onClick={() => { setStatusFilter(''); setTypeFilter(''); setPage(1); }}
            className="text-xs text-violet-400 hover:text-violet-300 transition-colors px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table card */}
      <div className={cardBase}>
        {loading ? (
          <div className="p-12 text-center text-[#8b8baf]">
            <div className="inline-block w-6 h-6 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin mb-3" />
            <div className="text-sm">Loading transactions...</div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-t-2xl">
            <table className="w-full border-collapse" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  {['Customer', 'Amount', 'Failure Type', 'Status', 'AI Action', 'Recovery Prob.', 'Date'].map(h => (
                    <th
                      key={h}
                      className="text-left px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-[#8b8baf] border-b border-violet-500/10 bg-[#0d0d1f]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center p-12 text-[#8b8baf] text-sm">
                      No transactions found. Generate mock data from the Dashboard first.
                    </td>
                  </tr>
                ) : (
                  data.transactions.map(txn => {
                    const lastAction = txn.recoveryActions?.[0];
                    return (
                      <tr
                        key={txn.id}
                        onClick={() => navigate(`/transactions/${txn.id}`)}
                        className="group hover:bg-violet-500/5 transition-colors duration-150 cursor-pointer"
                      >
                        {/* Customer */}
                        <td className="px-5 py-3.5 border-b border-violet-500/5">
                          <div className="font-medium text-[#f0f0ff] text-sm">{txn.customer?.name}</div>
                          <div className="text-xs text-[#8b8baf] mt-0.5">
                            {txn.customer?.type === 'B2B' && (
                              <span className="text-blue-400 font-semibold">B2B · </span>
                            )}
                            {txn.customer?.email}
                          </div>
                        </td>
                        {/* Amount */}
                        <td className="px-5 py-3.5 border-b border-violet-500/5">
                          <div className="font-bold text-[#f0f0ff]">{fmt(txn.amount)}</div>
                          {txn.recoveredAmount && (
                            <div className="text-xs text-emerald-400 font-medium mt-0.5">
                              ✓ {fmt(txn.recoveredAmount)}
                            </div>
                          )}
                        </td>
                        {/* Failure type */}
                        <td className="px-5 py-3.5 border-b border-violet-500/5">
                          <FailureBadge failureType={txn.failureType} />
                          <div className="text-[11px] text-[#8b8baf] mt-1">{txn.errorCode}</div>
                        </td>
                        {/* Status */}
                        <td className="px-5 py-3.5 border-b border-violet-500/5">
                          <StatusBadge status={txn.status} />
                        </td>
                        {/* AI Action */}
                        <td className="px-5 py-3.5 border-b border-violet-500/5 text-[13px] text-[#f0f0ff]">
                          {lastAction ? (
                            <span>
                              {ACTION_ICONS[lastAction.actionType] || '❓'}{' '}
                              <span className="text-[#8b8baf] text-[12px]">
                                {lastAction.actionType.replace(/_/g, ' ')}
                              </span>
                            </span>
                          ) : (
                            <span className="text-[#8b8baf]">Pending</span>
                          )}
                        </td>
                        {/* Recovery Prob */}
                        <td className="px-5 py-3.5 border-b border-violet-500/5">
                          {lastAction?.recoveryProb != null ? (
                            <div className="flex items-center gap-2">
                              <div className="w-14 h-1.5 bg-violet-500/15 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    lastAction.recoveryProb > 0.7 ? 'bg-emerald-400' :
                                    lastAction.recoveryProb > 0.4 ? 'bg-amber-400' : 'bg-red-400'
                                  }`}
                                  style={{ width: `${(lastAction.recoveryProb * 100).toFixed(0)}%` }}
                                />
                              </div>
                              <span className="text-xs text-[#8b8baf]">
                                {(lastAction.recoveryProb * 100).toFixed(0)}%
                              </span>
                            </div>
                          ) : <span className="text-[#8b8baf]">—</span>}
                        </td>
                        {/* Date */}
                        <td className="px-5 py-3.5 border-b border-violet-500/5 text-[13px] text-[#8b8baf] whitespace-nowrap">
                          {format(new Date(txn.createdAt), 'MMM d, HH:mm')}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          totalPages={data.totalPages}
          onPrev={() => setPage(p => Math.max(1, p - 1))}
          onNext={() => setPage(p => Math.min(data.totalPages, p + 1))}
        />
      </div>
    </div>
  );
}
