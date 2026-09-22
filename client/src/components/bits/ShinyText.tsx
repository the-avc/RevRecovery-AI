import React, { useEffect, useRef, useState } from 'react';
import './ShinyText.css';

// ShinyText — adapted from React Bits (reactbits.dev)

interface ShinyTextProps {
  text: string;
  speed?: number;
  className?: string;
  color?: string;
  shineColor?: string;
}

export default function ShinyText({
  text,
  speed = 3,
  className = '',
  color = '#a78bfa',
  shineColor = '#ffffff',
}: ShinyTextProps) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const posRef = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;

    el.style.setProperty('--shiny-color', color);
    el.style.setProperty('--shine-color', shineColor);

    const animate = () => {
      posRef.current = (posRef.current - speed * 0.3) % 200;
      el.style.backgroundPosition = `${posRef.current}% center`;
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [speed, color, shineColor]);

  return (
    <span ref={spanRef} className={`shiny-text ${className}`}>
      {text}
    </span>
  );
}
