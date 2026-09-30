import { create } from 'zustand';
import { initStorage, type StorageStatus } from '@/services/storage';
import { isStandalone } from '@/services/displayMode';

interface AppStatusState {
  storage: StorageStatus | null;
  standalone: boolean;
  init: () => Promise<void>;
}

export const useAppStatus = create<AppStatusState>((set, get) => ({
  storage: null,
  standalone: false,
  init: async () => {
    set({ standalone: isStandalone() });
    if (get().storage) {
      return;
    }
    set({ storage: await initStorage() });
  },
}));
