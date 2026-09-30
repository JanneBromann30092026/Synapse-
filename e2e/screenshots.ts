/**
 * Creates iPad screenshots of the production build (vite preview).
 * Usage: npm run screenshots  →  screenshots/*.png
 */
import { mkdirSync } from 'node:fs';
import { chromium, type BrowserContextOptions } from '@playwright/test';
import { preview } from 'vite';
import { IPAD_LANDSCAPE, IPAD_PORTRAIT, PREVIEW_URL } from './ipad.ts';

interface Shot {
  /** Hash route, e.g. "/" or "/projects". */
  route: string;
  name: string;
}

const SHOTS: Shot[] = [{ route: '/', name: 'start' }];

const VARIANTS: { name: string; options: BrowserContextOptions }[] = [
  { name: 'landscape-dark', options: { ...IPAD_LANDSCAPE, colorScheme: 'dark' } },
  { name: 'landscape-light', options: { ...IPAD_LANDSCAPE, colorScheme: 'light' } },
  { name: 'portrait-dark', options: { ...IPAD_PORTRAIT, colorScheme: 'dark' } },
  { name: 'portrait-light', options: { ...IPAD_PORTRAIT, colorScheme: 'light' } },
];

const outDir = new URL('../screenshots/', import.meta.url);
mkdirSync(outDir, { recursive: true });

const server = await preview();
const browser = await chromium.launch();
try {
  for (const variant of VARIANTS) {
    const context = await browser.newContext({
      ...variant.options,
      // Keep screenshots free of the "offline ready" toast.
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    for (const shot of SHOTS) {
      await page.goto(`${PREVIEW_URL}#${shot.route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      const file = new URL(`${shot.name}-${variant.name}.png`, outDir).pathname;
      await page.screenshot({ path: file });
      console.log(`✓ ${file}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
