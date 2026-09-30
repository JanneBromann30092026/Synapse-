/**
 * Creates iPad screenshots of the production build (vite preview).
 * Usage: npm run screenshots  →  screenshots/*.png
 */
import { mkdirSync } from 'node:fs';
import { chromium, type BrowserContextOptions, type Page } from '@playwright/test';
import { preview } from 'vite';
import { IPAD_LANDSCAPE, IPAD_PORTRAIT, PREVIEW_URL } from './ipad.ts';

interface Shot {
  /** Hash route, e.g. "/projects". */
  route: string;
  name: string;
  /** Optional interaction before the screenshot (e.g. opening a dialog). */
  prepare?: (page: Page) => Promise<void>;
  /** Additionally screenshot the rest of the scrolling page in viewport-sized steps. */
  scroll?: boolean;
}

async function enableDevModeWithSamples(page: Page) {
  await page.goto(`${PREVIEW_URL}#/settings`);
  const toggle = page.getByRole('switch', { name: 'Entwicklermodus' });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await page.goto(`${PREVIEW_URL}#/dev/ui`);
  await page.getByRole('button', { name: 'Beispielprojekte anlegen' }).click();
  await page.getByTestId('project-count').filter({ hasText: '5' }).waitFor();
}

const click = (name: string) => async (page: Page) => {
  const target = page.getByRole('button', { name }).first();
  await target.scrollIntoViewIfNeeded();
  await target.click();
};

async function openFilledDialog(page: Page) {
  await page.getByRole('button', { name: 'Neues Projekt' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Neues Projekt' });
  await dialog.getByLabel('Name').fill('Spanisch');
  await dialog.getByLabel('Beschreibung').fill('Reisewortschatz für den Sommer');
  await dialog.getByRole('radio', { name: 'Orange' }).click();
  await dialog.getByRole('radio', { name: 'plane' }).click();
}

async function openDeleteConfirm(page: Page) {
  await page.getByRole('button', { name: 'Aktionen für Japanisch' }).click();
  await page.getByRole('menuitem', { name: 'Löschen' }).click();
}

const SHOTS: Shot[] = [
  { route: '/projects', name: 'projects-empty' },
  { route: '/settings', name: 'settings' },
  { route: '/dev/ui', name: 'dev-ui', prepare: enableDevModeWithSamples },
  { route: '/projects', name: 'projects-grid', scroll: true },
  { route: '/projects', name: 'project-dialog', prepare: openFilledDialog },
  { route: '/projects', name: 'project-menu', prepare: click('Aktionen für BWL-Begriffe') },
  { route: '/projects', name: 'project-delete', prepare: openDeleteConfirm },
  {
    route: '/projects',
    name: 'projects-search',
    prepare: async (page) => {
      await page.getByRole('searchbox', { name: 'Projekte suchen' }).fill('isch');
    },
  },
];

const VARIANTS: { name: string; options: BrowserContextOptions }[] = [
  { name: 'landscape-dark', options: { ...IPAD_LANDSCAPE, colorScheme: 'dark' } },
  { name: 'landscape-light', options: { ...IPAD_LANDSCAPE, colorScheme: 'light' } },
  { name: 'portrait-dark', options: { ...IPAD_PORTRAIT, colorScheme: 'dark' } },
  { name: 'portrait-light', options: { ...IPAD_PORTRAIT, colorScheme: 'light' } },
];

const outDir = new URL('../screenshots/', import.meta.url);
mkdirSync(outDir, { recursive: true });

async function capture(page: Page, name: string) {
  const file = new URL(`${name}.png`, outDir).pathname;
  await page.screenshot({ path: file });
  console.log(`✓ ${file}`);
}

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
      // Same hash = no navigation; reload so dialogs from the previous shot are gone.
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      await shot.prepare?.(page);
      const container = page.locator('[data-scroll-container]');
      if (shot.scroll) {
        await container.evaluate((element) => {
          element.scrollTop = 0;
        });
      }
      await page.waitForTimeout(700);
      await capture(page, `${shot.name}-${variant.name}`);
      if (!shot.scroll) continue;
      for (let part = 2; part <= 8; part += 1) {
        const moved = await container.evaluate((element) => {
          const before = element.scrollTop;
          element.scrollTop += element.clientHeight - 80;
          return element.scrollTop !== before;
        });
        if (!moved) break;
        await page.waitForTimeout(300);
        await capture(page, `${shot.name}-${part}-${variant.name}`);
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
