import React, { useEffect, useRef, useState } from 'react';

// CountUp — adapted from React Bits (reactbits.dev)
// Spring-animated number counter that triggers when in view

interface CountUpProps {
  to: number;
  from?: number;
  duration?: number;
  delay?: number;
  separator?: string;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  formatter?: (value: number) => string;
}

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export default function CountUp({
  to,
  from = 0,
  duration = 1.5,
  delay = 0,
  separator = '',
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
  formatter,
}: CountUpProps) {
  const [value, setValue] = useState(from);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;

    let startTime: number | null = null;
    const delayMs = delay * 1000;
    const durationMs = duration * 1000;

    const tick = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const elapsed = timestamp - startTime;

      if (elapsed < delayMs) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const progress = Math.min((elapsed - delayMs) / durationMs, 1);
      const eased = easeOutExpo(progress);
      const current = from + (to - from) * eased;
      setValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setValue(to);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [inView, to, from, duration, delay]);

  const display = () => {
    if (formatter) return formatter(value);
    const fixed = value.toFixed(decimals);
    if (separator) {
      const parts = fixed.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separator);
      return prefix + parts.join('.') + suffix;
    }
    return prefix + fixed + suffix;
  };

  return (
    <span ref={ref} className={className}>
      {display()}
    </span>
  );
}
