import React, { useEffect, useState, useCallback } from 'react';
import {
  TrendingUp, AlertTriangle, Zap, Clock,
  Play, Database, RefreshCw, Download,
} from 'lucide-react';
import { getStats, runBatchRecovery, generateMockData, downloadCSV } from '../api';
import type { DashboardStats } from '../api';
import { FAILURE_COLORS, FAILURE_LABELS, btnPrimary, btnGhost } from '../constants';

import Aurora from '../components/bits/Aurora';
import BlurText from '../components/bits/BlurText';
import KPICard from '../components/dashboard/KPICard';
import RecoveryBarChart from '../components/dashboard/RecoveryBarChart';
import StatusDonutChart from '../components/dashboard/StatusDonutChart';
import RecentRecoveriesTable from '../components/dashboard/RecentRecoveriesTable';
import SkeletonCard from '../components/ui/SkeletonCard';
import Button from '../components/ui/Button';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const data = await getStats();
      setStats(data);
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const result = await generateMockData(50);
      setLastResult(
        `✅ Generated ${result.created || 50} mock transactions and saved to CSV. Click "Download CSV" to view the raw dataset.`
      );
      await fetchStats();
    } catch {
      setLastResult('❌ Seeding failed. Make sure Node server is running.');
    } finally {
      setSeeding(false);
    }
  };

  const handleRunBatch = async () => {
    setRunning(true);
    setLastResult(null);
    try {
      const result = await runBatchRecovery();
      setLastResult(`✅ Batch complete! Processed ${result.processed} transactions worth ₹${result.totalAtRisk?.toLocaleString('en-IN')}.`);
      await fetchStats();
    } catch {
      setLastResult('❌ Batch failed. Make sure all 3 servers are running.');
    } finally {
      setRunning(false);
    }
  };

  const pieData = stats?.failureTypeBreakdown?.map(f => ({
    name: FAILURE_LABELS[f.failureType] || f.failureType,
    value: f._sum?.amount || 0,
    count: f._count,
    color: FAILURE_COLORS[f.failureType] || '#666',
  })) || [];

  const statusData = stats?.statusBreakdown?.map(s => ({
    name: s.status,
    value: s._count,
    amount: s._sum?.amount || 0,
  })) || [];

  return (
    <div className="relative">
      {/* Aurora animated hero header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 h-56">
          <Aurora
            colorStops={['#4c1d95', '#7c3aed', '#ec4899']}
            amplitude={0.35}
            blend={0.5}
            speed={0.45}
          />
        </div>

        {/* Header content */}
        <div className="relative z-10 px-6 pt-8 pb-10 sm:px-8 lg:px-10">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-5 max-w-7xl mx-auto">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold font-space mb-2 text-white">
                <BlurText text="Revenue Recovery" delay={60} />
                {' '}
                <span className="bg-gradient-to-r from-violet-300 via-pink-300 to-amber-300 bg-clip-text text-transparent">
                  <BlurText text="Dashboard" delay={60} />
                </span>
              </h1>
              <p className="text-white/70 text-sm sm:text-[15px]">
                AI-powered detection, diagnosis, and recovery of lost revenue
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 items-center shrink-0">
              <button
                className={`${btnGhost} text-sm py-2.5 px-4 whitespace-nowrap`}
                onClick={handleSeed}
                disabled={seeding}
              >
                {seeding ? <RefreshCw size={15} className="animate-spin" /> : <Database size={15} />}
                {seeding ? 'Generating...' : 'Generate Data'}
              </button>
              <button
                className={`${btnGhost} text-sm py-2.5 px-4 whitespace-nowrap`}
                onClick={downloadCSV}
                title="Download current/generated transactions as CSV"
              >
                <Download size={15} />
                Download CSV
              </button>
              <button
                className={`${btnPrimary} text-sm py-2.5 px-4 whitespace-nowrap ${!running ? 'animate-pulse-glow' : ''}`}
                onClick={handleRunBatch}
                disabled={running}
              >
                {running ? <RefreshCw size={15} className="animate-spin" /> : <Play size={15} />}
                {running ? 'AI Running...' : 'Run AI Recovery'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Page body */}
      <div className="px-6 sm:px-8 lg:px-10 pb-10 max-w-7xl mx-auto -mt-4">
        {/* Status message */}
        {lastResult && (
          <div className="px-5 py-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl mb-6 text-sm text-emerald-400 flex flex-wrap items-center justify-between gap-3 animate-fade-in">
            <span>{lastResult}</span>
            <button
              onClick={downloadCSV}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 rounded-lg text-xs text-emerald-300 font-medium transition-all"
            >
              <Download size={13} />
              Download CSV Now
            </button>
          </div>
        )}


        {/* KPI Cards — responsive grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {loading ? (
            Array(4).fill(0).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <KPICard
                label="Total At Risk"
                rawValue={stats?.totalAtRisk || 0}
                displayFormatter={fmt}
                subtitle={`${stats?.totalTransactions || 0} transactions`}
                icon={AlertTriangle}
                color="#ef4444"
                delay={0}
              />
              <KPICard
                label="Total Recovered"
                rawValue={stats?.totalRecovered || 0}
                displayFormatter={fmt}
                subtitle="via AI recovery agent"
                icon={TrendingUp}
                color="#10b981"
                delay={100}
              />
              <KPICard
                label="Recovery Rate"
                rawValue={stats?.recoveryRate || 0}
                displayFormatter={n => `${n.toFixed(1)}%`}
                subtitle="of at-risk revenue"
                icon={Zap}
                color="#8b5cf6"
                delay={200}
              />
              <KPICard
                label="In Recovery"
                rawValue={stats?.statusBreakdown?.find(s => s.status === 'IN_RECOVERY')?._count || 0}
                displayFormatter={n => String(Math.round(n))}
                subtitle="actions pending"
                icon={Clock}
                color="#f59e0b"
                delay={300}
              />
            </>
          )}
        </div>

        {/* Charts row — responsive */}
        {!loading && (pieData.length > 0 || statusData.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5 mb-6">
            <RecoveryBarChart data={pieData} />
            <StatusDonutChart data={statusData} />
          </div>
        )}

        {/* Recent Recoveries */}
        {!loading && (stats?.recentRecoveries?.length || 0) > 0 && (
          <RecentRecoveriesTable
            transactions={stats!.recentRecoveries}
            fmt={fmt}
          />
        )}

        {/* Empty state */}
        {!loading && stats?.totalTransactions === 0 && (
          <div className="text-center py-20 px-10 animate-fade-in">
            <div className="text-6xl mb-5">🚀</div>
            <h2 className="text-2xl font-bold mb-3 text-[#f0f0ff]">Ready to Recover Revenue</h2>
            <p className="text-[#8b8baf] mb-8 max-w-md mx-auto">
              Start by generating mock data to simulate 50 failed transactions, then run the AI recovery agent.
            </p>
            <button className={btnPrimary} onClick={handleSeed} disabled={seeding}>
              <Database size={17} />
              Generate Mock Data to Begin
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
