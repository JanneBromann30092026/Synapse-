import { cn } from './cn';

/** Placeholder block while content loads, with a soft shimmer (off with reduced motion). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton rounded-lg', className)} />;
}
