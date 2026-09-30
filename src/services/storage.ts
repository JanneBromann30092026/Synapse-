export interface StorageStatus {
  /** null when the Storage API is not available. */
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
}

/**
 * Asks the browser to keep our IndexedDB data even under storage pressure.
 * Safari may otherwise evict data of sites that were not used for a while.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  const storage = globalThis.navigator?.storage;
  if (!storage?.persist) {
    return null;
  }
  try {
    if (await storage.persisted()) {
      return true;
    }
    return await storage.persist();
  } catch {
    return false;
  }
}

export async function getStorageEstimate(): Promise<Pick<StorageStatus, 'usage' | 'quota'>> {
  const storage = globalThis.navigator?.storage;
  if (!storage?.estimate) {
    return { usage: null, quota: null };
  }
  try {
    const { usage, quota } = await storage.estimate();
    return { usage: usage ?? null, quota: quota ?? null };
  } catch {
    return { usage: null, quota: null };
  }
}

export async function initStorage(): Promise<StorageStatus> {
  const persisted = await requestPersistentStorage();
  const estimate = await getStorageEstimate();
  return { persisted, ...estimate };
}
