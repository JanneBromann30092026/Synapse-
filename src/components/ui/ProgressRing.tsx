import { useEffect, useState } from 'react';
import { animate, motion } from 'motion/react';
import { useReducedMotion } from '@/styles/useReducedMotion';
import { cn } from './cn';

export interface ProgressRingProps {
  /** 0..1 */
  value: number;
  label: string;
  size?: number;
  strokeWidth?: number;
  /** Color of the ring; defaults to red → amber → green by value. */
  color?: string;
  className?: string;
}

function colorFor(value: number): string {
  if (value >= 0.8) return 'var(--success)';
  if (value >= 0.5) return 'var(--warning)';
  return 'var(--danger)';
}

/** Animated SVG ring; the percentage counts up. */
export function ProgressRing({
  value,
  label,
  size = 120,
  strokeWidth = 10,
  color,
  className,
}: ProgressRingProps) {
  const reduced = useReducedMotion();
  const clamped = Math.min(1, Math.max(0, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const [animated, setAnimated] = useState(0);
  const shown = reduced ? clamped : animated;

  useEffect(() => {
    if (reduced) return;
    const controls = animate(0, clamped, {
      duration: 1.1,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: setAnimated,
    });
    return () => controls.stop();
  }, [clamped, reduced]);

  const percent = Math.round(shown * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border-strong)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color ?? colorFor(shown)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown)}
        />
      </svg>
      <span
        className="absolute font-semibold tracking-tight text-fg tabular-nums"
        style={{ fontSize: size * 0.24 }}
      >
        {percent} %
      </span>
    </div>
  );
}
