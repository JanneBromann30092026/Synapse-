/** Mirror of BrainDebug in src/core/brain/frames.ts (set by the brain view in developer mode). */
interface FrameSummary {
  count: number;
  mean: number;
  p50: number;
  p95: number;
  max: number;
}

declare global {
  interface Window {
    __synapseBrain?: {
      draw: () => FrameSummary;
      interval: () => FrameSummary;
      reset: () => void;
      engineRunning: () => boolean;
      nodes: number;
      links: number;
      nodeScreen: (id: string) => { x: number; y: number } | null;
      zoom: () => number;
    };
  }
}

export {};
