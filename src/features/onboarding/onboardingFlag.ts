/**
 * localStorage mirror of the onboardingDone setting: the welcome must not flash up before the
 * settings are loaded from IndexedDB. Playwright sets it to skip the welcome in tests.
 */
export const ONBOARDING_DONE_KEY = 'synapse.onboardingDone';

export function readOnboardingFlag(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_DONE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeOnboardingFlag(): void {
  try {
    localStorage.setItem(ONBOARDING_DONE_KEY, '1');
  } catch {
    // Private mode: the setting in IndexedDB still decides.
  }
}
