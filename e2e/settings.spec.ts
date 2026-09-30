import { expect, test, type Page, type Route } from '@playwright/test';

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

const KEY = 'sk-ant-api03-test-0123456789abcdefghijklmnopqrstuvwxyz';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

/** Fake Anthropic API (no real calls in tests). Records the requests it received. */
async function mockAnthropic(page: Page, status: 200 | 401) {
  const requests: { url: string; apiKey: string | null }[] = [];
  await page.route('https://api.anthropic.com/**', async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    requests.push({ url: request.url(), apiKey: request.headers()['x-api-key'] ?? null });
    await route.fulfill(
      status === 200
        ? {
            status: 200,
            headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
            body: JSON.stringify({
              type: 'model',
              id: 'claude-haiku-4-5-20251001',
              display_name: 'Claude Haiku 4.5',
              created_at: '2025-10-01T00:00:00Z',
            }),
          }
        : {
            status: 401,
            headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
            body: JSON.stringify({
              type: 'error',
              error: { type: 'authentication_error', message: 'invalid x-api-key' },
            }),
          },
    );
  });
  return requests;
}

test('API key: save, test connection, never shown again, remove', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  const requests = await mockAnthropic(page, 200);
  await page.goto('./#/settings');
  const ai = page.getByTestId('settings-ai');
  const keyInput = ai.getByLabel('API-Key', { exact: true });

  await expect(ai.getByTestId('api-key-status')).toHaveText('Kein Key hinterlegt');

  // Without a key: understandable message, no request.
  await ai.getByRole('button', { name: 'Verbindung testen' }).click();
  await expect(ai.getByTestId('connection-result')).toContainText('Kein API-Key hinterlegt');
  expect(requests).toHaveLength(0);

  // Invalid key format.
  await keyInput.fill('hello world');
  await ai.getByRole('button', { name: 'Key speichern' }).click();
  await expect(ai.getByText('Das sieht nicht nach einem Anthropic-API-Key aus')).toBeVisible();

  // Valid key: stored, field cleared, only "Key hinterlegt" is shown.
  await keyInput.fill(`  ${KEY}  `);
  await expect(keyInput).toHaveAttribute('type', 'password');
  await ai.getByRole('button', { name: 'Key speichern' }).click();
  await expect(page.getByText('API-Key gespeichert')).toBeVisible();
  await expect(ai.getByTestId('api-key-status')).toHaveText('Key hinterlegt');
  await expect(keyInput).toHaveValue('');

  await page.reload();
  await expect(ai.getByTestId('api-key-status')).toHaveText('Key hinterlegt');
  expect(await page.content()).not.toContain(KEY);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('sk-ant-');

  // Connection test with the (mocked) API.
  await ai.getByRole('button', { name: 'Verbindung testen' }).click();
  await expect(ai.getByTestId('connection-result')).toContainText(
    'Verbindung steht – Claude Haiku 4.5 ist bereit.',
  );
  expect(requests).toHaveLength(1);
  expect(requests[0]?.url).toContain('/v1/models/claude-haiku-4-5-20251001');
  expect(requests[0]?.apiKey).toBe(KEY);

  // Remove the key.
  await ai.getByRole('button', { name: 'Entfernen' }).click();
  await page
    .getByRole('alertdialog', { name: 'API-Key entfernen?' })
    .getByRole('button', { name: 'Entfernen' })
    .click();
  await expect(ai.getByTestId('api-key-status')).toHaveText('Kein Key hinterlegt');

  expect(problems.filter((p) => !p.includes('401'))).toEqual([]);
});

test('a rejected key shows an authentication message', async ({ page }) => {
  await mockAnthropic(page, 401);
  await page.goto('./#/settings');
  const ai = page.getByTestId('settings-ai');
  await ai.getByLabel('API-Key', { exact: true }).fill(KEY);
  await ai.getByRole('button', { name: 'Key speichern' }).click();
  await expect(ai.getByTestId('api-key-status')).toHaveText('Key hinterlegt');
  await ai.getByRole('button', { name: 'Verbindung testen' }).click();
  await expect(ai.getByTestId('connection-result')).toContainText('Der API-Key wurde abgelehnt');
});

test('AI can be switched off and the model is validated', async ({ page }) => {
  await page.goto('./#/settings');
  const ai = page.getByTestId('settings-ai');
  const model = ai.getByLabel('Modell');
  await expect(model).toHaveValue('claude-haiku-4-5-20251001');

  await model.fill('Claude Haiku!');
  await model.press('Enter');
  await expect(ai.getByText('Ungültiger Modellname')).toBeVisible();
  await model.fill('claude-sonnet-5-5');
  await model.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Gespeichert' })).toBeVisible();
  await page.reload();
  await expect(ai.getByLabel('Modell')).toHaveValue('claude-sonnet-5-5');
  await ai.getByRole('button', { name: 'Standard' }).click();
  await expect(ai.getByLabel('Modell')).toHaveValue('claude-haiku-4-5-20251001');

  await ai.getByRole('radio', { name: 'Aus' }).click();
  await expect(ai.getByText('Ohne KI bewertest du deine Antworten')).toBeVisible();
  await expect(ai.getByRole('button', { name: 'Verbindung testen' })).toHaveCount(0);
  await page.reload();
  await expect(ai.getByRole('radio', { name: 'Aus' })).toHaveAttribute('aria-checked', 'true');
});

test('study defaults are saved immediately and survive a reload', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  await page.goto('./#/settings');
  const learning = page.getByTestId('settings-learning');

  await learning.getByRole('radio', { name: 'Großzügig' }).click();
  await expect(
    learning.getByText('Im Kern richtig und nichts sachlich falsch genügt.'),
  ).toBeVisible();
  await learning.getByLabel('Abfragerichtung').selectOption({ label: 'Gemischt' });
  await learning.getByRole('radio', { name: 'Selbstbewertung' }).click();
  const slider = learning.getByRole('slider', { name: 'Tippfehlertoleranz' });
  await expect(slider).toHaveAttribute('aria-valuenow', '0.85');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '0.87');
  await expect(page.getByRole('status').filter({ hasText: 'Gespeichert' })).toBeVisible();

  await page.reload();
  await expect(learning.getByRole('radio', { name: 'Großzügig' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(learning.getByLabel('Abfragerichtung')).toHaveValue('mixed');
  await expect(learning.getByRole('radio', { name: 'Selbstbewertung' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(learning.getByRole('slider', { name: 'Tippfehlertoleranz' })).toHaveAttribute(
    'aria-valuenow',
    '0.87',
  );
  expect(problems).toEqual([]);
});
