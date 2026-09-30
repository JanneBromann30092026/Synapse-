import { useId, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from './cn';

export interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Formats the value shown next to the label and announced to screen readers. */
  format?: (value: number) => string;
  className?: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Touch-friendly slider: tap or drag anywhere on the track (large 28 px thumb). */
export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  format = (v) => String(v),
  className,
}: SliderProps) {
  const id = useId();
  const track = useRef<HTMLDivElement>(null);
  const ratio = (clamp(value, min, max) - min) / (max - min);

  const snap = (raw: number) => {
    const stepped = Math.round((raw - min) / step) * step + min;
    return Number(clamp(stepped, min, max).toFixed(6));
  };

  const updateFromPointer = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    onChange(snap(min + ((clientX - rect.left) / rect.width) * (max - min)));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(event.clientX);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(event.clientX);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const big = (max - min) / 10;
    const next: Record<string, number> = {
      ArrowRight: value + step,
      ArrowUp: value + step,
      ArrowLeft: value - step,
      ArrowDown: value - step,
      PageUp: value + big,
      PageDown: value - big,
      Home: min,
      End: max,
    };
    const target = next[event.key];
    if (target === undefined) return;
    event.preventDefault();
    onChange(snap(target));
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between px-1 text-sm">
        <span id={`${id}-label`} className="font-medium text-fg-secondary">
          {label}
        </span>
        <span className="font-medium text-fg tabular-nums">{format(value)}</span>
      </div>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-labelledby={`${id}-label`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
        className="focus-ring no-callout relative flex h-11 touch-none items-center rounded-full"
      >
        <div className="h-2 w-full rounded-full bg-line-strong">
          <div className="h-full rounded-full bg-accent" style={{ width: `${ratio * 100}%` }} />
        </div>
        <div
          className="absolute size-7 -translate-x-1/2 rounded-full border border-line bg-white shadow-card"
          style={{ left: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
