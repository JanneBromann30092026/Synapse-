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

async function loadDemoData(page: Page) {
  await page.goto('./#/settings');
  const toggle = page.getByRole('switch', { name: 'Entwicklermodus' });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page.goto('./#/dev/ui');
  await page.getByRole('button', { name: 'Demo-Daten laden' }).click();
  await expect(page.getByText(/Projekte mit \d+ Karten angelegt/)).toBeVisible();
}

const stat = (page: Page, label: string) =>
  page.getByTestId('brain-summary').locator('div', { hasText: label }).locator('span').first();

test('brain: no download without consent, embeddings and links with the test embedder', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const problems = collectConsoleProblems(page);
  // The real model is never downloaded in tests.
  const modelRequests: string[] = [];
  await page.context().route(/huggingface\.co|\.hf\.co/, async (route) => {
    modelRequests.push(route.request().url());
    await route.abort();
  });

  await page.goto('./#/brain');
  await expect(page.getByText('Das Gehirn wächst noch')).toBeVisible();

  await loadDemoData(page);
  await page.goto('./#/brain');
  const setup = page.getByTestId('brain-setup');
  await expect(setup).toContainText('ca. 140 MB');
  await expect(setup).toContainText('Bitte nur im WLAN laden.');
  await expect(page.getByTestId('brain-download')).toBeEnabled();

  // Settings: model not downloaded, switch to the test embedder (developer mode).
  await page.goto('./#/settings');
  const brain = page.getByTestId('settings-brain');
  await expect(brain.getByTestId('brain-model-status')).toHaveText('Nicht heruntergeladen');
  await expect(brain.getByRole('button', { name: 'Modell löschen' })).toBeDisabled();
  await expect(brain.getByTestId('brain-settings-status')).toHaveText(
    '0 von 90 Karten analysiert · 0 Verbindungen',
  );
  await brain.getByRole('radio', { name: 'Test ohne Download' }).click();

  // The background sync embeds and links everything.
  await expect(brain.getByTestId('brain-settings-status')).toHaveText(
    /^90 von 90 Karten analysiert · [1-9]\d* Verbindungen$/,
    { timeout: 20_000 },
  );

  await page.goto('./#/brain');
  await expect(stat(page, 'Karten analysiert')).toHaveText('90');
  const crossLinks = page.getByTestId('brain-cross-links').getByRole('listitem');
  await expect(crossLinks.first()).toBeVisible();
  // BWL and stocks share terms such as Cashflow and Eigenkapitalquote.
  await expect(crossLinks.filter({ hasText: 'Eigenkapitalquote' }).first()).toBeVisible();

  // A new card is embedded and linked in the background (incrementally).
  await page.goto('./#/projects');
  await page.getByRole('link', { name: 'Aktien & Börse öffnen' }).click();
  await expect(page.getByTestId('card-count')).toHaveText('30 Karten');
  await page.keyboard.press('n');
  const editor = page.getByRole('dialog', { name: 'Karten hinzufügen' });
  await editor.getByTestId('card-front').fill('Eigenkapitalquote einer Bank');
  await editor.getByTestId('card-back').fill('Kernkapital im Verhältnis zu den Risikoaktiva');
  await editor.getByTestId('card-back').press('Enter');
  await editor.getByRole('button', { name: 'Fertig' }).click();
  await page.goto('./#/brain');
  await expect(stat(page, 'Karten analysiert')).toHaveText('91', { timeout: 20_000 });

  // Stricter threshold → fewer links; recompute on demand.
  await page.goto('./#/settings');
  const status = brain.getByTestId('brain-settings-status');
  await expect(status).toHaveText(/^91 von 91/);
  const before = Number((await status.textContent())?.match(/(\d+) Verbindungen/)?.[1]);
  await brain.getByRole('slider', { name: 'Ähnlichkeitsschwelle' }).focus();
  await page.keyboard.press('PageUp');
  await page.keyboard.press('PageUp');
  await expect
    .poll(async () => Number((await status.textContent())?.match(/(\d+) Verbindungen/)?.[1]), {
      timeout: 20_000,
    })
    .toBeLessThan(before);
  await brain.getByRole('button', { name: 'Verknüpfungen neu berechnen' }).click();
  await expect(page.getByText('Verknüpfungen neu berechnet')).toBeVisible();

  // Links survive a reload (stored in IndexedDB).
  await page.reload();
  await expect(status).toHaveText(/^91 von 91 Karten analysiert · \d+ Verbindungen$/);

  expect(modelRequests).toEqual([]);
  expect(problems).toEqual([]);
});
