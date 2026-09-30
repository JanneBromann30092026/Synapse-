import { useLiveQuery } from 'dexie-react-hooks';

/**
 * Reactive data access for components: re-runs the querier (a repository call) whenever
 * the IndexedDB data it read changes – also across tabs. Returns undefined while loading.
 * Components use this instead of importing Dexie.
 */
export function useLiveData<T>(
  querier: () => Promise<T>,
  deps: readonly unknown[] = [],
): T | undefined {
  return useLiveQuery(querier, [...deps]);
}
