import { expect, test, type Page } from '@playwright/test';

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test('start page loads without console errors', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('./');

  await expect(page.getByRole('heading', { level: 1, name: 'Synapse' })).toBeVisible();
  await expect(page.getByTestId('app-version')).toHaveText(/^\d+\.\d+\.\d+$/);
  await expect(page.getByTestId('persisted')).not.toHaveText('Wird geprüft …');
  await expect(page.getByTestId('storage-used')).not.toHaveText('Wird geprüft …');

  const csp = page.locator('meta[http-equiv="Content-Security-Policy"]');
  await expect(csp).toHaveCount(1);

  expect(errors).toEqual([]);
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
  const errors = collectConsoleErrors(page);
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Wait until the service worker controls the page (precache complete).
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Synapse' })).toBeVisible();
  await context.setOffline(false);

  expect(errors).toEqual([]);
});
