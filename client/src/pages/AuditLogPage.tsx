import React, { useEffect, useState } from 'react';
import { getAuditLogs } from '../api';
import type { AuditLog } from '../api';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { ScrollText } from 'lucide-react';
import { cardBase } from '../constants';
import Pagination from '../components/ui/Pagination';

const ACTOR_STYLES: Record<string, { bg: string; color: string; icon: string }> = {
  RAZORPAY_WEBHOOK: { bg: 'bg-amber-500/15',  color: 'text-amber-400',  icon: '🔔' },
  AI_AGENT:         { bg: 'bg-violet-500/15', color: 'text-violet-400', icon: '🧠' },
  CRON_JOB:         { bg: 'bg-blue-500/15',   color: 'text-blue-400',   icon: '⏰' },
  USER:             { bg: 'bg-emerald-500/15', color: 'text-emerald-400', icon: '👤' },
  SYSTEM:           { bg: 'bg-gray-500/15',   color: 'text-gray-400',   icon: '⚙️' },
};

export default function AuditLogPage() {
  const [data, setData] = useState<{ logs: AuditLog[]; total: number }>({ logs: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(data.total / 50);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    getAuditLogs({ page })
      .then(res => { setData(res); setLoading(false); })
      .catch(() => setLoading(false));
  }, [page]);

  return (
    <div className="px-6 sm:px-8 lg:px-10 py-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-7 flex items-start gap-3">
        <div className="w-10 h-10 bg-violet-500/15 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
          <ScrollText size={18} className="text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-space mb-1.5 text-[#f0f0ff]">
            Audit Trail
          </h1>
          <p className="text-[#8b8baf] text-sm">
            Immutable log of every AI decision, webhook event, and system action.{' '}
            <span className="text-violet-400 font-semibold">{data.total}</span> total entries.
          </p>
        </div>
      </div>

      <div className={cardBase}>
        {loading ? (
          <div className="p-12 text-center text-[#8b8baf]">
            <div className="inline-block w-6 h-6 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin mb-3" />
            <div className="text-sm">Loading audit logs...</div>
          </div>
        ) : data.logs.length === 0 ? (
          <div className="p-12 text-center text-[#8b8baf] text-sm">
            No audit logs yet. Generate mock data and run the AI agent from the Dashboard.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-t-2xl">
            <table className="w-full border-collapse" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  {['Timestamp', 'Event', 'Actor', 'Transaction', 'Details'].map(h => (
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
                {data.logs.map(log => {
                  const style = ACTOR_STYLES[log.actor] || ACTOR_STYLES.SYSTEM;
                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-violet-500/5 transition-colors duration-150"
                    >
                      <td className="px-5 py-3.5 border-b border-violet-500/5 text-xs font-mono text-[#8b8baf] whitespace-nowrap">
                        {format(new Date(log.createdAt), 'MMM d, HH:mm:ss')}
                      </td>
                      <td className="px-5 py-3.5 border-b border-violet-500/5 font-semibold text-[13px] text-[#f0f0ff]">
                        {log.event.replace(/_/g, ' ')}
                      </td>
                      <td className="px-5 py-3.5 border-b border-violet-500/5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${style.bg} ${style.color}`}
                        >
                          {style.icon} {log.actor}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 border-b border-violet-500/5">
                        {log.transactionId ? (
                          <button
                            onClick={() => navigate(`/transactions/${log.transactionId}`)}
                            className="bg-violet-500/10 border border-violet-500/20 text-violet-400 px-2.5 py-1 rounded-md text-[11px] font-mono hover:bg-violet-500/20 transition-colors"
                          >
                            {log.transactionId.slice(0, 10)}…
                          </button>
                        ) : (
                          <span className="text-[#8b8baf] text-[13px]">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 border-b border-violet-500/5 max-w-[280px]">
                        <pre className="text-[11px] text-[#8b8baf] m-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono">
                          {JSON.stringify(log.details)}
                        </pre>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage(p => Math.max(1, p - 1))}
          onNext={() => setPage(p => Math.min(totalPages, p + 1))}
        />
      </div>
    </div>
  );
}
