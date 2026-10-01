import { defineConfig } from '@playwright/test';
import { IPAD_LANDSCAPE, IPAD_PORTRAIT, PREVIEW_URL, SKIP_ONBOARDING_STATE } from './e2e/ipad.ts';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: PREVIEW_URL,
    browserName: 'chromium',
    trace: 'retain-on-failure',
    storageState: SKIP_ONBOARDING_STATE,
  },
  projects: [
    { name: 'ipad-landscape', use: IPAD_LANDSCAPE },
    { name: 'ipad-portrait', use: IPAD_PORTRAIT },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: PREVIEW_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
