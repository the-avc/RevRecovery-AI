import React from 'react';
import { CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cardBase, FAILURE_LABELS, FAILURE_COLORS } from '../../constants';
import { FailureBadge } from '../ui/Badge';
import type { Transaction } from '../../api';

interface RecentRecoveriesTableProps {
  transactions: Transaction[];
  fmt: (n: number) => string;
}

export default function RecentRecoveriesTable({ transactions, fmt }: RecentRecoveriesTableProps) {
  if (!transactions.length) return null;

  return (
    <div className={`${cardBase} overflow-hidden`}>
      <div className="p-6 pb-0">
        <h3 className="font-bold text-base flex items-center gap-2 text-[#f0f0ff] mb-5">
          <CheckCircle size={17} className="text-emerald-400" />
          Recent Recoveries
        </h3>
      </div>

      {/* Responsive table wrapper */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              {['Customer', 'Amount Recovered', 'Failure Type', 'Recovered At'].map(h => (
                <th
                  key={h}
                  className="text-left px-6 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#8b8baf] border-b border-violet-500/10"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.map(t => (
              <tr
                key={t.id}
                className="hover:bg-violet-500/5 transition-colors duration-150"
              >
                <td className="px-6 py-3.5 border-b border-violet-500/5">
                  <div className="font-medium text-[#f0f0ff] text-sm">{t.customer?.name}</div>
                  <div className="text-xs text-[#8b8baf]">{t.customer?.email}</div>
                </td>
                <td className="px-6 py-3.5 border-b border-violet-500/5 font-bold text-emerald-400 text-sm">
                  {fmt(t.recoveredAmount || t.amount)}
                </td>
                <td className="px-6 py-3.5 border-b border-violet-500/5">
                  <FailureBadge failureType={t.failureType} />
                </td>
                <td className="px-6 py-3.5 border-b border-violet-500/5 text-[#8b8baf] text-[13px]">
                  {t.recoveredAt ? format(new Date(t.recoveredAt), 'MMM d, HH:mm') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
