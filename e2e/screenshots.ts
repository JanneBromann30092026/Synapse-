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

async function enableDevModeWithDemoData(page: Page) {
  await page.goto(`${PREVIEW_URL}#/settings`);
  const toggle = page.getByRole('switch', { name: 'Entwicklermodus' });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await page.goto(`${PREVIEW_URL}#/dev/ui`);
  await page.getByRole('button', { name: 'Demo-Daten laden' }).click();
  await page.getByTestId('project-count').filter({ hasText: '3' }).waitFor();
}

const openProject = (name: string) => async (page: Page) => {
  await page.getByRole('link', { name: `${name} öffnen` }).click();
  await page.getByRole('heading', { level: 1, name }).waitFor();
  await page.waitForTimeout(400);
};

async function openGridView(page: Page) {
  await openProject('BWL-Grundbegriffe')(page);
  await page.getByRole('button', { name: 'Rasteransicht' }).click();
  await page.waitForTimeout(400);
  await page.getByTestId('card-tile').nth(1).getByRole('button').first().click();
}

async function openEditorWithCounter(page: Page) {
  await openProject('Japanisch Grundwortschatz')(page);
  await page.getByRole('button', { name: 'Karte hinzufügen' }).click();
  await page.getByTestId('card-front').fill('魚');
  await page.getByTestId('card-back').fill('Fisch');
  await page.getByRole('button', { name: 'Speichern & nächste' }).click();
  await page.getByText('1 Karte in dieser Sitzung hinzugefügt').waitFor();
  await page.getByTestId('card-front').fill('鳥');
  await page.getByTestId('card-back').fill('Vogel; Huhn');
  await page.getByRole('button', { name: 'Notizen oder Kontext hinzufügen' }).click();
  await page.getByLabel('Notizen / Kontext').fill('とり · tori');
}

async function openDuplicateWarning(page: Page) {
  await openProject('Japanisch Grundwortschatz')(page);
  await page.getByRole('button', { name: 'Karte hinzufügen' }).click();
  await page.getByTestId('card-front').fill('犬');
  await page.getByTestId('card-back').fill('Hund');
  await page.getByRole('button', { name: 'Speichern & nächste' }).click();
  await page.getByRole('button', { name: 'Trotzdem speichern' }).waitFor();
}

async function selectCards(page: Page) {
  await openProject('Aktien & Börse')(page);
  await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
  for (const index of [0, 2, 3]) {
    await page.getByTestId('card-row').nth(index).getByRole('button').first().click();
  }
}

async function swipeRow(page: Page) {
  await openProject('Aktien & Börse')(page);
  const row = await page.getByTestId('card-row').nth(1).boundingBox();
  if (!row) return;
  // Real touch events (like a finger on the iPad).
  const cdp = await page.context().newCDPSession(page);
  const y = row.y + row.height / 2;
  const startX = row.x + row.width * 0.6;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: startX, y }],
  });
  for (let i = 1; i <= 12; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: startX - (200 * i) / 12, y }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const SHOTS: Shot[] = [
  { route: '/projects', name: 'projects-empty' },
  { route: '/dev/ui', name: 'dev-ui', prepare: enableDevModeWithDemoData },
  { route: '/projects', name: 'projects-grid' },
  {
    route: '/projects',
    name: 'project-list',
    prepare: openProject('Aktien & Börse'),
    scroll: true,
  },
  { route: '/projects', name: 'project-grid-view', prepare: openGridView },
  { route: '/projects', name: 'card-editor', prepare: openEditorWithCounter },
  { route: '/projects', name: 'card-duplicate', prepare: openDuplicateWarning },
  { route: '/projects', name: 'project-select', prepare: selectCards },
  { route: '/projects', name: 'project-swipe', prepare: swipeRow },
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
