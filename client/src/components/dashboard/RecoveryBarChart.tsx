import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Cell, ResponsiveContainer,
} from 'recharts';
import { FAILURE_COLORS, FAILURE_LABELS, cardBase } from '../../constants';

interface BarItem {
  name: string;
  value: number;
  count: number;
  color: string;
}

interface RecoveryBarChartProps {
  data: BarItem[];
}

export default function RecoveryBarChart({ data }: RecoveryBarChartProps) {
  return (
    <div className={`${cardBase} p-6`}>
      <h3 className="font-bold mb-1 text-base text-[#f0f0ff]">Revenue at Risk by Failure Type</h3>
      <p className="text-[#8b8baf] text-[13px] mb-5">Amount in INR across all failure categories</p>
      <div className="w-full" style={{ minHeight: 260 }}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} barSize={32} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.08)" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: '#8b8baf', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={50}
            />
            <YAxis
              tick={{ fill: '#8b8baf', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`}
              width={52}
            />
            <Tooltip
              contentStyle={{
                background: '#0d0d1f',
                border: '1px solid rgba(139,92,246,0.25)',
                borderRadius: '12px',
                padding: '10px 14px',
              }}
              formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, 'Amount']}
              labelStyle={{ color: '#f0f0ff', fontWeight: 600, marginBottom: 4 }}
              cursor={{ fill: 'rgba(139,92,246,0.05)' }}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
