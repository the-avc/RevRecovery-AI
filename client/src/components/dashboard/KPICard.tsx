import React from 'react';
import CountUp from '../bits/CountUp';
import { cardBase } from '../../constants';

interface KPICardProps {
  label: string;
  rawValue: number;
  displayFormatter: (n: number) => string;
  subtitle?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
  color: string;
  delay?: number;
  isPercent?: boolean;
  isCurrency?: boolean;
}

export default function KPICard({
  label,
  rawValue,
  displayFormatter,
  subtitle,
  icon: Icon,
  color,
  delay = 0,
  isPercent = false,
  isCurrency = false,
}: KPICardProps) {
  // For CountUp: strip currency symbols and parse numeric value
  const numericValue = rawValue;

  return (
    <div
      className={`${cardBase} p-6 animate-slide-up`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-[#8b8baf] font-semibold uppercase tracking-widest mb-3">
            {label}
          </div>
          <div
            className="text-3xl xl:text-4xl font-extrabold font-space leading-none"
            style={{ color }}
          >
            <CountUp
              to={numericValue}
              duration={1.4}
              delay={delay / 1000}
              formatter={displayFormatter}
            />
          </div>
          {subtitle && (
            <div className="text-xs text-[#8b8baf] mt-2 leading-relaxed">{subtitle}</div>
          )}
        </div>
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center border shrink-0 ml-3"
          style={{ background: `${color}15`, borderColor: `${color}30` }}
        >
          <Icon size={20} color={color} />
        </div>
      </div>
      {/* Bottom accent bar */}
      <div className="mt-4 h-0.5 rounded-full" style={{ background: `linear-gradient(to right, ${color}40, transparent)` }} />
    </div>
  );
}
