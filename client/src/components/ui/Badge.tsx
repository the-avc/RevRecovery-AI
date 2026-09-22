import React from 'react';
import { getStatusClasses, FAILURE_COLORS, FAILURE_LABELS } from '../../constants';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide ${getStatusClasses(status)} ${className}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

interface FailureBadgeProps {
  failureType: string;
  className?: string;
}

export function FailureBadge({ failureType, className = '' }: FailureBadgeProps) {
  const color = FAILURE_COLORS[failureType] || '#6b7280';
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide border ${className}`}
      style={{
        background: `${color}18`,
        color,
        borderColor: `${color}35`,
      }}
    >
      {FAILURE_LABELS[failureType] || failureType}
    </span>
  );
}
