import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import { App } from '@/app/App';
import { applyReduceMotion, applyTheme } from '@/app/theme';
import { readBootPrefs } from '@/features/settings/settingsStore';
import '@/styles/global.css';

// Apply the stored theme before the first render to avoid a flash of the wrong theme.
const bootPrefs = readBootPrefs();
applyTheme(bootPrefs.theme);
applyReduceMotion(bootPrefs.reduceMotion);

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
