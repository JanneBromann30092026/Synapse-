import { create } from 'zustand';

interface BrainViewState {
  /** Hides sidebar/tab bar while the brain is open. */
  fullscreen: boolean;
  legendOpen: boolean;
  setFullscreen: (fullscreen: boolean) => void;
  setLegendOpen: (open: boolean) => void;
}

/** UI state of the brain view (not persisted). */
export const useBrainView = create<BrainViewState>((set) => ({
  fullscreen: false,
  legendOpen: false,
  setFullscreen: (fullscreen) => set({ fullscreen }),
  setLegendOpen: (legendOpen) => set({ legendOpen }),
}));
