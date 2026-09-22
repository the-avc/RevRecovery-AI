import React from 'react';
import { cardBase } from '../../constants';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
  style?: React.CSSProperties;
}

export default function Card({ children, className = '', padding = true, style }: CardProps) {
  return (
    <div className={`${cardBase} ${padding ? 'p-6' : ''} ${className}`} style={style}>
      {children}
    </div>
  );
}
