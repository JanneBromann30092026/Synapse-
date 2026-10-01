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

test.describe('first start', () => {
  // Empty storage: the welcome is not marked as done.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('walks through the welcome and loads demo projects', async ({ page }) => {
    const problems = collectConsoleProblems(page);
    await page.goto('./');
    const dialog = page.getByTestId('onboarding');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('onboarding-step-welcome')).toBeVisible();
    await page.getByTestId('onboarding-next').click();
    // Browser tab (not standalone): the install guide is shown.
    await expect(page.getByTestId('onboarding-step-install')).toBeVisible();
    await page.getByTestId('onboarding-next').click();
    await expect(page.getByTestId('onboarding-step-ai')).toBeVisible();
    await page.getByTestId('onboarding-key').fill('kein-key');
    await page.getByRole('button', { name: 'Key speichern' }).click();
    await expect(page.getByText('Das sieht nicht nach einem Anthropic-API-Key aus')).toBeVisible();
    await page.getByTestId('onboarding-next').click();
    await expect(page.getByTestId('onboarding-step-start')).toBeVisible();
    await page.getByTestId('onboarding-demo').click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('link', { name: /BWL-Grundbegriffe/ }).first()).toBeVisible();

    // Done for good: a reload shows the projects directly.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Projekte' })).toBeVisible();
    await expect(dialog).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('can be skipped and stays closed', async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('onboarding-skip').click();
    await expect(page.getByTestId('onboarding')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Noch keine Projekte' })).toBeVisible();
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Projekte' })).toBeVisible();
    await page.waitForTimeout(500);
    // The setting in IndexedDB also remembers it.
    await expect(page.getByTestId('onboarding')).toHaveCount(0);
  });
});

test('"?" opens the shortcut overview, also from the settings', async ({ page }) => {
  await page.goto('./#/projects');
  await expect(page.getByRole('heading', { level: 1, name: 'Projekte' })).toBeVisible();
  await page.keyboard.press('Shift+?');
  await expect(page.getByTestId('shortcuts')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('shortcuts')).toHaveCount(0);

  await page.goto('./#/settings');
  await page.getByTestId('open-shortcuts').click();
  await expect(page.getByRole('dialog', { name: 'Tastaturkürzel' })).toBeVisible();
});

test('error log records errors without secrets and copies them', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./#/settings');
  await expect(page.getByTestId('error-log-count')).toHaveText(
    'Keine Einträge – alles läuft rund.',
  );

  await page.evaluate(() => {
    console.error('Request failed for sk-ant-api03-SECRETSECRETSECRET1234', {
      front: 'Kartentext',
    });
    // Same events the browser fires for uncaught errors (scripts from evaluate are exempt).
    window.dispatchEvent(
      new ErrorEvent('error', { error: new Error('Testfehler aus dem Fenster') }),
    );
    const promise = Promise.resolve();
    window.dispatchEvent(
      new PromiseRejectionEvent('unhandledrejection', {
        promise,
        reason: new Error('Abgelehntes Versprechen'),
      }),
    );
  });
  await expect(page.getByTestId('error-log-count')).toHaveText('3 Einträge');

  await page.getByRole('button', { name: 'Fehlerprotokoll kopieren' }).click();
  await expect(page.getByText('Fehlerprotokoll kopiert')).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('Synapse – Fehlerprotokoll');
  expect(text).toContain('Testfehler aus dem Fenster');
  expect(text).toContain('Abgelehntes Versprechen');
  expect(text).toContain('sk-ant-[entfernt]');
  expect(text).not.toContain('SECRETSECRET');
  expect(text).not.toContain('Kartentext');

  await page.getByRole('button', { name: 'Leeren' }).click();
  await expect(page.getByTestId('error-log-count')).toHaveText(
    'Keine Einträge – alles läuft rund.',
  );
});
