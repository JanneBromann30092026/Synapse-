import { cn } from './cn';

/** Placeholder block while content loads. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse rounded-lg bg-line-strong/60 motion-reduce:animate-none',
        className,
      )}
    />
  );
}
