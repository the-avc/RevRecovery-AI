import React from 'react';
import { cardBase } from '../../constants';

export default function SkeletonCard() {
  return (
    <div className={`${cardBase} p-6`}>
      <div className="h-3.5 w-3/5 mb-4 rounded-lg bg-shimmer-gradient animate-shimmer" />
      <div className="h-9 w-2/5 mb-2 rounded-lg bg-shimmer-gradient animate-shimmer" />
      <div className="h-3 w-1/2 rounded-lg bg-shimmer-gradient animate-shimmer" />
    </div>
  );
}
