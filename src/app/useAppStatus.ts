import { create } from 'zustand';
import { openDatabase, type DbOpenResult } from '@/data/db';
import { initStorage, type StorageStatus } from '@/services/storage';
import { isStandalone } from '@/services/displayMode';

interface AppStatusState {
  storage: StorageStatus | null;
  /** null while the database is opening. */
  database: DbOpenResult | null;
  standalone: boolean;
  init: () => Promise<void>;
}

export const useAppStatus = create<AppStatusState>((set, get) => ({
  storage: null,
  database: null,
  standalone: false,
  init: async () => {
    set({ standalone: isStandalone() });
    if (get().storage) {
      return;
    }
    // Persistence first, so Safari marks the origin as persistent before data is written.
    set({ storage: await initStorage() });
    set({ database: await openDatabase() });
  },
}));
