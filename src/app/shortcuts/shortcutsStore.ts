import { create } from 'zustand';

interface ShortcutsState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

/** Visibility of the keyboard shortcut overview ("?" or the button in the settings). */
export const useShortcutsHelp = create<ShortcutsState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
