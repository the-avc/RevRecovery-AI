import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getTransactionDetail } from "../api";
import type { Transaction } from "../api";
import { format } from "date-fns";
import {
  ArrowLeft,
  Volume2,
  ExternalLink,
  Brain,
  User,
  DollarSign,
} from "lucide-react";
import { ACTION_LABELS, cardBase } from "../constants";
import { StatusBadge } from "../components/ui/Badge";
import Card from "../components/ui/Card";

export default function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [txn, setTxn] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getTransactionDetail(id)
      .then(setTxn)
      .finally(() => setLoading(false));
  }, [id]);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(n);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64 text-text-secondary">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin mb-3" />
          <div className="text-sm">Loading transaction...</div>
        </div>
      </div>
    );
  }

  if (!txn) {
    return (
      <div className="p-8 text-red-400 text-center">
        <div className="text-4xl mb-3">⚠️</div>
        Transaction not found.
      </div>
    );
  }

  const action = txn.recoveryActions?.[0];
  const actionMeta = action ? ACTION_LABELS[action.actionType] : null;

  return (
    <div className="px-6 sm:px-8 lg:px-10 py-8 max-w-4xl mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate("/transactions")}
        className="flex items-center gap-2 text-text-secondary text-sm mb-6 hover:text-text-primary transition-colors group"
      >
        <ArrowLeft
          size={15}
          className="transition-transform group-hover:-translate-x-1"
        />
        Back to Transactions
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-7">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold font-space mb-1.5 text-text-primary">
            Transaction Detail
          </h1>
          <div className="text-xs text-text-secondary font-mono bg-bg-card px-3 py-1.5 rounded-lg inline-block border border-violet-500/15">
            ID: {txn.id}
          </div>
        </div>
        <StatusBadge status={txn.status} className="self-start" />
      </div>

      {/* Info cards — responsive 2-col */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        {/* Customer */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-violet-500/15 rounded-lg flex items-center justify-center">
              <User size={15} className="text-violet-400" />
            </div>
            <h3 className="text-[12px] text-text-secondary uppercase tracking-widest font-semibold">
              Customer
            </h3>
          </div>
          <div className="font-bold text-lg mb-1 text-text-primary">
            {txn.customer?.name}
          </div>
          <div className="text-text-secondary text-sm mb-1">
            {txn.customer?.email}
          </div>
          {txn.customer?.phone && (
            <div className="text-text-secondary text-sm">
              {txn.customer.phone}
            </div>
          )}
          {txn.customer?.type === "B2B" && (
            <span className="inline-block mt-3 px-2.5 py-1 bg-blue-500/15 text-blue-400 rounded-md text-xs font-semibold">
              B2B · {txn.customer.company}
            </span>
          )}
        </Card>

        {/* Financial */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-red-500/15 rounded-lg flex items-center justify-center">
              <DollarSign size={15} className="text-red-400" />
            </div>
            <h3 className="text-[12px] text-text-secondary uppercase tracking-widest font-semibold">
              Financial Details
            </h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-text-secondary text-sm">
                Amount at Risk
              </span>
              <span className="font-bold text-red-400 text-lg">
                {fmt(txn.amount)}
              </span>
            </div>
            {txn.recoveredAmount && (
              <div className="flex justify-between items-center">
                <span className="text-text-secondary text-sm">Recovered</span>
                <span className="font-bold text-emerald-400 text-lg">
                  {fmt(txn.recoveredAmount)}
                </span>
              </div>
            )}
            {txn.retryCount > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-text-secondary text-sm">Retry Count</span>
                <span className="font-semibold text-amber-400">
                  {txn.retryCount}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-violet-500/10">
              <span className="text-text-secondary text-sm">Error Code</span>
              <code className="text-[13px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                {txn.errorCode}
              </code>
            </div>
            {txn.errorDescription && (
              <div className="text-text-secondary text-[13px] leading-relaxed">
                {txn.errorDescription}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* AI Decision Card */}
      {action && (
        <div
          className={`${cardBase} p-6 mb-6 border-violet-500/35 animate-pulse-glow`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-violet-500/20 rounded-xl flex items-center justify-center">
                <Brain size={18} className="text-violet-400" />
              </div>
              <h3 className="text-base font-bold text-text-primary">
                AI Decision
              </h3>
            </div>
            {actionMeta && (
              <span
                className={`sm:ml-auto px-3 py-1.5 rounded-lg text-[13px] font-semibold border self-start ${actionMeta.bg} ${actionMeta.color} ${actionMeta.border}`}
              >
                {actionMeta.label}
              </span>
            )}
          </div>

          {/* Root Cause + Reasoning */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div className="p-4 bg-violet-500/10 rounded-xl border border-violet-500/15">
              <div className="text-[11px] text-text-secondary uppercase tracking-widest mb-2 font-semibold">
                Root Cause
              </div>
              <div className="text-sm text-text-primary leading-relaxed">
                {action.aiRootCause || "—"}
              </div>
            </div>
            <div className="p-4 bg-violet-500/10 rounded-xl border border-violet-500/15">
              <div className="text-[11px] text-text-secondary uppercase tracking-widest mb-2 font-semibold">
                Reasoning
              </div>
              <div className="text-sm text-text-primary leading-relaxed">
                {action.aiReasoning || "—"}
              </div>
            </div>
          </div>

          {/* Confidence metrics */}
          <div className="flex flex-wrap gap-6">
            <div>
              <div className="text-[11px] text-text-secondary mb-1">
                AI Confidence
              </div>
              <div className="font-bold text-violet-400 text-lg">
                {action.aiConfidence != null
                  ? `${(action.aiConfidence * 100).toFixed(0)}%`
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-text-secondary mb-1">
                Recovery Probability
              </div>
              <div
                className={`font-bold text-lg ${(action.recoveryProb || 0) > 0.6 ? "text-emerald-400" : "text-amber-400"}`}
              >
                {action.recoveryProb != null
                  ? `${(action.recoveryProb * 100).toFixed(1)}%`
                  : "—"}
              </div>
            </div>
            {action.executedAt && (
              <div>
                <div className="text-[11px] text-text-secondary mb-1">
                  Executed At
                </div>
                <div className="text-sm text-text-primary">
                  {format(new Date(action.executedAt), "MMM d, HH:mm:ss")}
                </div>
              </div>
            )}
          </div>

          {/* Payment Link */}
          {action.paymentLinkUrl && (
            <div className="mt-5 p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-3">
                <div className="text-xs text-emerald-400 font-semibold">
                  ✅ Recovery Payment Link Generated
                </div>
                <button
                  onClick={() => navigate(`/pay/${txn.id}`)}
                  className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-600 transition-colors shadow-sm self-start sm:self-auto"
                >
                  Simulate Payment
                </button>
              </div>
              <a
                href={action.paymentLinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-emerald-400 text-sm hover:underline break-all"
              >
                {action.paymentLinkUrl}
                <ExternalLink size={13} className="shrink-0" />
              </a>
            </div>
          )}

          {/* Voice Audio */}
          {action.voiceAudioPath && (
            <div className="mt-4 p-4 bg-pink-500/10 rounded-xl border border-pink-500/20">
              <div className="flex items-center gap-2 mb-3">
                <Volume2 size={15} className="text-pink-400" />
                <span className="text-[13px] text-pink-400 font-semibold">
                  Hinglish Voice Message
                </span>
              </div>
              <audio controls className="w-full">
                <source
                  src={`/audio/${action.voiceAudioPath.split(/[/\\]/).pop()}`}
                  type="audio/mpeg"
                />
              </audio>
            </div>
          )}
        </div>
      )}

      {/* Audit Trail timeline */}
      {(txn.auditLogs?.length || 0) > 0 && (
        <Card>
          <h3 className="font-bold mb-6 text-base text-text-primary">
            Audit Trail
          </h3>
          <div className="flex flex-col gap-0">
            {txn.auditLogs!.map((log, i) => (
              <div key={log.id} className="flex gap-4 pb-6 relative">
                {i < txn.auditLogs!.length - 1 && (
                  <div className="absolute left-3 top-7 bottom-0 w-px bg-violet-500/15" />
                )}
                <div
                  className={`w-6 h-6 rounded-full shrink-0 border-2 flex items-center justify-center text-[10px] z-10 ${
                    log.actor === "AI_AGENT"
                      ? "bg-violet-500/20 border-violet-400"
                      : log.actor === "RAZORPAY_WEBHOOK"
                        ? "bg-amber-500/20 border-amber-400"
                        : "bg-emerald-500/20 border-emerald-400"
                  }`}
                >
                  {log.actor === "AI_AGENT"
                    ? "🧠"
                    : log.actor === "RAZORPAY_WEBHOOK"
                      ? "🔔"
                      : "⚙️"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-sm text-text-primary">
                      {log.event.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-text-secondary shrink-0 ml-2">
                      {format(new Date(log.createdAt), "HH:mm:ss")}
                    </span>
                  </div>
                  <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-violet-500/10 text-violet-400 mb-2 font-medium">
                    {log.actor}
                  </span>
                  <pre className="text-[11px] text-text-secondary bg-black/30 p-2.5 rounded-lg overflow-auto max-h-32 m-0 whitespace-pre-wrap font-mono">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
