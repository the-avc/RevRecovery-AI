import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { STATUS_COLORS, cardBase } from '../../constants';

interface StatusItem {
  name: string;
  value: number;
  amount: number;
}

interface StatusDonutChartProps {
  data: StatusItem[];
}

const STATUS_LABEL: Record<string, string> = {
  FAILED: 'Failed',
  IN_RECOVERY: 'In Recovery',
  RECOVERED: 'Recovered',
  ABANDONED: 'Abandoned',
  PROMISE_TO_PAY: 'Promise to Pay',
};

export default function StatusDonutChart({ data }: StatusDonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className={`${cardBase} p-6`}>
      <h3 className="font-bold mb-1 text-base text-[#f0f0ff]">Transaction Status</h3>
      <p className="text-[#8b8baf] text-[13px] mb-4">Current state of all transactions</p>

      <div className="relative">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={88}
              paddingAngle={3}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={STATUS_COLORS[entry.name] || '#6b7280'} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: '#0d0d1f',
                border: '1px solid rgba(139,92,246,0.25)',
                borderRadius: '12px',
                padding: '10px 14px',
              }}
              formatter={(v: number, _: string, props: any) => [
                `${v} (${total ? ((v / total) * 100).toFixed(1) : 0}%)`,
                STATUS_LABEL[props.payload.name] || props.payload.name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Centre label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-2xl font-extrabold font-space text-[#f0f0ff]">{total}</div>
          <div className="text-[11px] text-[#8b8baf]">total</div>
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4">
        {data.map(s => (
          <div key={s.name} className="flex items-center gap-2 text-xs text-[#8b8baf]">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: STATUS_COLORS[s.name] || '#6b7280' }}
            />
            <span className="truncate">{STATUS_LABEL[s.name] || s.name}</span>
            <span className="text-[#f0f0ff] font-semibold ml-auto">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
