import { expect, test, type Page } from '@playwright/test';

function collectConsoleProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => problems.push(error.message));
  return problems;
}

async function enableDevMode(page: Page) {
  await page.goto('./#/settings');
  const toggle = page.getByRole('switch', { name: 'Entwicklermodus' });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
}

test('app shell loads without console errors or warnings', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  await page.goto('./');

  await expect(page).toHaveURL(/#\/projects$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Projekte' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeVisible();
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);

  expect(problems).toEqual([]);
});

test('navigation switches pages', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  await page.goto('./');
  const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
  for (const name of ['Gehirn', 'Statistik', 'Einstellungen', 'Projekte']) {
    await nav.getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  }
  await expect(page.getByTestId('app-version')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('settings show the system status', async ({ page }) => {
  await page.goto('./#/settings');
  await expect(page.getByTestId('app-version')).toHaveText(/^\d+\.\d+\.\d+$/);
  await expect(page.getByTestId('database-status')).toHaveText('Bereit');
  await expect(page.getByTestId('persisted')).not.toHaveText('Wird geprüft …');
});

test('theme choice is applied and survives a reload', async ({ page }) => {
  await page.goto('./#/settings');
  const html = page.locator('html');
  await page.getByRole('radio', { name: 'Hell' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.getByRole('radio', { name: 'Dunkel' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute(
    'content',
    '#0b0d12',
  );

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'Dunkel' })).toHaveAttribute('aria-checked', 'true');
});

test('developer mode shows the dev area and demo data persists', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
  await page.goto('./');
  await expect(nav.getByRole('link', { name: 'Entwickler' })).toHaveCount(0);

  await enableDevMode(page);
  await nav.getByRole('link', { name: 'Entwickler' }).click();
  await expect(page.getByTestId('dev-section-buttons')).toBeVisible();

  await expect(page.getByTestId('project-count')).toHaveText('0');
  await page.getByRole('button', { name: 'Testprojekt anlegen' }).click();
  await expect(page.getByTestId('project-count')).toHaveText('1');
  await page.reload();
  await expect(page.getByTestId('project-count')).toHaveText('1');

  await page.getByRole('button', { name: 'Modal öffnen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Karte bearbeiten' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  expect(problems).toEqual([]);
});

test('manifest is linked and valid', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();

  const response = await request.get(new URL(href ?? '', page.url()).toString());
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as Record<string, unknown>;
  expect(manifest).toMatchObject({
    name: 'Synapse',
    display: 'standalone',
    start_url: '/Synapse-/',
    scope: '/Synapse-/',
  });
});

test('app works offline after the service worker is installed', async ({ page, context }) => {
  const problems = collectConsoleProblems(page);
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Wait until the service worker controls the page (precache complete).
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Projekte' })).toBeVisible();
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();
  await context.setOffline(false);

  expect(problems).toEqual([]);
});
