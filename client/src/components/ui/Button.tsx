import React from 'react';
import { btnPrimary, btnGhost } from '../../constants';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
  children: React.ReactNode;
}

export default function Button({ variant = 'primary', className = '', children, ...props }: ButtonProps) {
  const base = variant === 'primary' ? btnPrimary : btnGhost;
  return (
    <button className={`${base} ${className}`} {...props}>
      {children}
    </button>
  );
}
