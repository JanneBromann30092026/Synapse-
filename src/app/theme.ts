import type { ThemePreference } from '@/features/settings/settingsStore';

export type ResolvedTheme = 'light' | 'dark';

/** Must match --bg in src/styles/tokens.css (status bar color of the home screen app). */
const THEME_BACKGROUND: Record<ResolvedTheme, string> = {
  light: '#f5f6f8',
  dark: '#0b0d12',
};

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference;
  return darkQuery().matches ? 'dark' : 'light';
}

/** Sets data-theme on <html> and the theme-color meta tags (iOS status bar). */
export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const theme = resolveTheme(preference);
  document.documentElement.dataset.theme = theme;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.removeAttribute('media');
    meta.content = THEME_BACKGROUND[theme];
  }
  return theme;
}

export function applyReduceMotion(reduce: boolean): void {
  if (reduce) {
    document.documentElement.dataset.reduceMotion = '';
  } else {
    delete document.documentElement.dataset.reduceMotion;
  }
}

/** Calls the listener when the system theme changes. Returns an unsubscribe function. */
export function onSystemThemeChange(listener: () => void): () => void {
  const query = darkQuery();
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
