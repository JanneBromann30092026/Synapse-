/** Frame time statistics of the brain renderer (developer mode, Playwright measurements). */

export interface FrameSummary {
  count: number;
  mean: number;
  p50: number;
  p95: number;
  max: number;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index] ?? 0;
}

export function summarizeFrames(durations: readonly number[]): FrameSummary {
  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    mean: sorted.length === 0 ? 0 : sum / sorted.length,
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

/** Fixed-size ring buffer of the latest frame durations. */
export class FrameRecorder {
  private readonly values: number[] = [];

  constructor(private readonly capacity = 240) {}

  push(value: number): void {
    this.values.push(value);
    if (this.values.length > this.capacity) this.values.shift();
  }

  list(): number[] {
    return [...this.values];
  }

  clear(): void {
    this.values.length = 0;
  }
}

/** Developer mode: window.__synapseBrain (frame statistics and helpers for Playwright). */
export interface BrainDebug {
  draw: () => FrameSummary;
  interval: () => FrameSummary;
  reset: () => void;
  engineRunning: () => boolean;
  nodes: number;
  links: number;
  /** Screen position (relative to the canvas) of a node, e.g. to drag it in tests. */
  nodeScreen: (id: string) => { x: number; y: number } | null;
  zoom: () => number;
}
