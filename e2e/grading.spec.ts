import { expect, test, type Page } from '@playwright/test';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

async function openGradingPlayground(page: Page) {
  await page.goto('./#/settings');
  await page.getByRole('switch', { name: 'Entwicklermodus' }).click();
  await page.goto('./#/dev/ui');
  await page.getByRole('button', { name: 'Demo-Daten laden' }).click();
  await page.getByTestId('project-count').filter({ hasText: '3' }).waitFor();
  const section = page.getByTestId('dev-section-grading');
  await section.getByLabel('Projekt').selectOption({ label: 'Japanisch Grundwortschatz' });
  await section.getByLabel('Karte').selectOption({ label: '家 → Haus; Heim; Zuhause' });
  return section;
}

async function grade(section: ReturnType<Page['getByTestId']>, answer: string) {
  await section.getByLabel('Deine Antwort').fill(answer);
  await section.getByLabel('Deine Antwort').press('Enter');
}

test('grades locally without AI (free default)', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') problems.push(message.text());
  });
  let apiCalls = 0;
  await page.route('https://api.anthropic.com/**', async (route) => {
    apiCalls += 1;
    await route.abort();
  });
  const section = await openGradingPlayground(page);
  const verdict = section.getByTestId('grading-verdict');
  const method = section.getByTestId('grading-method');

  await grade(section, 'zuhause');
  await expect(verdict).toHaveText('Richtig');
  await expect(method).toHaveText('Exakt');

  await grade(section, 'Zuhaus');
  await expect(method).toHaveText('Tippfehler toleriert');

  await grade(section, 'keine Ahnung');
  await expect(verdict).toHaveText('Falsch');

  await grade(section, 'Wohnhaus');
  await expect(verdict).toHaveText('Selbstbewertung nötig');
  await expect(section.getByText('KI ist ausgeschaltet')).toBeVisible();
  await expect(section.getByText('Ähnlichste Antwort')).toBeVisible();

  // Other direction: the front side is expected.
  await section.getByRole('radio', { name: 'Rückseite → Vorderseite' }).click();
  await expect(section.getByTestId('grading-expected')).toHaveText('家');
  await grade(section, '家');
  await expect(verdict).toHaveText('Richtig');

  expect(apiCalls).toBe(0);
  expect(problems).toEqual([]);
});

test('asks the AI for unclear answers and then uses the cache', async ({ page }) => {
  const requests: unknown[] = [];
  await page.route('https://api.anthropic.com/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    requests.push(request.postDataJSON());
    await route.fulfill({
      status: 200,
      headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-haiku-4-5-20251001',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_test',
            name: 'submit_grade',
            input: {
              feedback: 'Richtig – ein Wohnhaus ist ein Haus.',
              verdict: 'correct',
              confidence: 0.9,
            },
          },
        ],
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
    });
  });

  await page.goto('./#/settings');
  const ai = page.getByTestId('settings-ai');
  await ai.getByRole('radio', { name: 'Anthropic' }).click();
  await ai.getByLabel('API-Key', { exact: true }).fill('sk-ant-api03-e2e-0123456789abcdefghij');
  await ai.getByRole('button', { name: 'Key speichern' }).click();
  await expect(ai.getByTestId('api-key-status')).toHaveText('Key hinterlegt');

  const section = await openGradingPlayground(page);
  await grade(section, 'Wohnhaus');
  await expect(section.getByTestId('grading-verdict')).toHaveText('Richtig');
  await expect(section.getByTestId('grading-method')).toHaveText('KI');
  await expect(section.getByText('Richtig – ein Wohnhaus ist ein Haus.')).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(JSON.stringify(requests[0])).toContain('<antwort>Wohnhaus</antwort>');

  // Same answer, written differently: from the cache, no second request.
  await grade(section, ' wohnhaus. ');
  await expect(section.getByTestId('grading-method')).toHaveText('KI · aus dem Cache');
  expect(requests).toHaveLength(1);

  // Clear answers never reach the AI.
  await grade(section, 'Heim');
  await expect(section.getByTestId('grading-method')).toHaveText('Exakt');
  expect(requests).toHaveLength(1);
});
