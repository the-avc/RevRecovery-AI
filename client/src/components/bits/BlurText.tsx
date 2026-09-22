import React, { useEffect, useRef, useState } from 'react';

// BlurText — adapted from React Bits (reactbits.dev)
// Requires: npm install motion

interface BlurTextProps {
  text: string;
  delay?: number;
  className?: string;
  animateBy?: 'words' | 'letters';
  direction?: 'top' | 'bottom';
  stepDuration?: number;
}

export default function BlurText({
  text,
  delay = 80,
  className = '',
  animateBy = 'words',
  direction = 'top',
  stepDuration = 0.4,
}: BlurTextProps) {
  const elements = animateBy === 'words' ? text.split(' ') : text.split('');
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

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

  return (
    <span ref={ref} className={`inline-flex flex-wrap gap-x-[0.25em] ${className}`}>
      {elements.map((el, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            opacity: inView ? 1 : 0,
            filter: inView ? 'blur(0px)' : 'blur(8px)',
            transform: inView
              ? 'translateY(0px)'
              : direction === 'top'
              ? 'translateY(-16px)'
              : 'translateY(16px)',
            transition: `opacity ${stepDuration}s ease, filter ${stepDuration}s ease, transform ${stepDuration}s ease`,
            transitionDelay: `${i * delay}ms`,
          }}
        >
          {el}
          {animateBy === 'words' && '\u00A0'}
        </span>
      ))}
    </span>
  );
}
