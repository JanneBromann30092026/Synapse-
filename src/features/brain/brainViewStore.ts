import { create } from 'zustand';

/** What is selected in the brain: a card (focus mode), a project hub or a link (popover). */
export type BrainSelection =
  | { kind: 'card'; id: string }
  | { kind: 'hub'; id: string }
  /** x/y: tap position relative to the brain view (anchor of the popover). */
  | { kind: 'link'; id: string; x: number; y: number };

interface BrainViewState {
  /** Hides sidebar/tab bar while the brain is open. */
  fullscreen: boolean;
  legendOpen: boolean;
  selection: BrainSelection | null;
  searchOpen: boolean;
  filterOpen: boolean;
  /** Card for which "Verbindung hinzufügen" is open. */
  linkSourceId: string | null;
  setFullscreen: (fullscreen: boolean) => void;
  setLegendOpen: (open: boolean) => void;
  select: (selection: BrainSelection | null) => void;
  setSearchOpen: (open: boolean) => void;
  setFilterOpen: (open: boolean) => void;
  setLinkSource: (cardId: string | null) => void;
}

/** UI state of the brain view (not persisted). */
export const useBrainView = create<BrainViewState>((set) => ({
  fullscreen: false,
  legendOpen: false,
  selection: null,
  searchOpen: false,
  filterOpen: false,
  linkSourceId: null,
  setFullscreen: (fullscreen) => set({ fullscreen }),
  setLegendOpen: (legendOpen) => set({ legendOpen }),
  select: (selection) => set({ selection }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setFilterOpen: (filterOpen) => set({ filterOpen }),
  setLinkSource: (linkSourceId) => set({ linkSourceId }),
}));
