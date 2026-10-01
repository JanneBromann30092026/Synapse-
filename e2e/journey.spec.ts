import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Final end-to-end run (step 16): first start → project → cards → study with a mocked AI →
 * repeat → statistics → brain → export/import. Never calls a real API or downloads the model.
 */

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

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

/** Fake Anthropic API: "Fell" answers are correct, everything else wrong. */
async function mockAnthropic(page: Page): Promise<string[]> {
  const bodies: string[] = [];
  await page.route('https://api.anthropic.com/**', async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    const body = request.postData() ?? '';
    bodies.push(body);
    const correct = body.includes('Fell');
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
              feedback: correct ? 'Passt – gemeint ist die Katze.' : 'Leider nicht.',
              verdict: correct ? 'correct' : 'incorrect',
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
  return bodies;
}

const CARDS = [
  { front: 'Hund', back: 'dog' },
  { front: 'Katze', back: 'cat' },
  { front: 'Vogel', back: 'bird' },
];

/** Answers of the first round: exact, AI (correct), "keine Ahnung" (wrong). */
const FIRST_ROUND = new Map([
  ['Hund', 'dog'],
  ['Katze', 'ein Tier mit Fell'],
  ['Vogel', 'keine Ahnung'],
]);

const phase = (page: Page) => page.getByTestId('study-surface');
const prompt = async (page: Page) =>
  (await page.getByTestId('study-card').last().getByTestId('study-prompt').textContent()) ?? '';

async function answer(page: Page, text: string, expected: 'presenting' | 'roundComplete') {
  await page.getByTestId('study-input').fill(text);
  await page.getByTestId('study-input').press('Enter');
  await expect(phase(page)).toHaveAttribute('data-phase', 'revealed');
  await page.getByTestId('study-input').press('Enter');
  await expect(phase(page)).toHaveAttribute('data-phase', expected);
}

test.describe('complete run', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('first start to export and import', async ({ page }) => {
    test.setTimeout(120_000);
    const problems = collectConsoleProblems(page);
    // No share sheet in Chromium: the export falls back to a download.
    await page.addInitScript(() => {
      Reflect.deleteProperty(Navigator.prototype, 'share');
      Reflect.deleteProperty(Navigator.prototype, 'canShare');
    });
    const aiRequests = await mockAnthropic(page);
    const modelRequests: string[] = [];
    await page.context().route(/huggingface\.co|\.hf\.co/, async (route) => {
      modelRequests.push(route.request().url());
      await route.abort();
    });

    // 1. First start: welcome, start empty.
    await page.goto('./');
    await expect(page.getByTestId('onboarding')).toBeVisible();
    for (const step of ['welcome', 'install', 'ai']) {
      await expect(page.getByTestId(`onboarding-step-${step}`)).toBeVisible();
      await page.getByTestId('onboarding-next').click();
    }
    await page.getByTestId('onboarding-empty').click();
    await expect(page.getByTestId('onboarding')).toHaveCount(0);

    // 2. Settings: AI with a (fake) key, developer mode for the test embedder.
    await page.goto('./#/settings');
    const ai = page.getByTestId('settings-ai');
    await ai.getByRole('radio', { name: 'Anthropic' }).click();
    await ai.getByLabel('API-Key', { exact: true }).fill('sk-ant-api03-e2e-0123456789abcdefghij');
    await ai.getByRole('button', { name: 'Key speichern' }).click();
    await expect(ai.getByTestId('api-key-status')).toHaveText('Key hinterlegt');
    await page.getByRole('switch', { name: 'Entwicklermodus' }).click();
    await page
      .getByTestId('settings-brain')
      .getByRole('radio', { name: 'Test ohne Download' })
      .click();

    // 3. Project and cards.
    await page.goto('./#/projects');
    await page.getByRole('button', { name: 'Erstes Projekt anlegen' }).click();
    await page.getByRole('dialog').getByLabel('Name').fill('Tiere');
    await page.getByRole('button', { name: 'Anlegen', exact: true }).click();
    await page.getByRole('link', { name: 'Tiere öffnen' }).click();
    await page.getByRole('button', { name: 'Erste Karte anlegen' }).click();
    const editor = page.getByRole('dialog', { name: 'Karten hinzufügen' });
    for (const card of CARDS) {
      await editor.getByTestId('card-front').fill(card.front);
      await editor.getByTestId('card-back').fill(card.back);
      await editor.getByTestId('card-back').press('Enter');
      await expect(editor.getByTestId('card-front')).toHaveValue('');
    }
    await editor.getByRole('button', { name: 'Fertig' }).click();
    await expect(page.getByTestId('card-count')).toHaveText('3 Karten');

    // 4. Study with automatic grading (local + mocked AI).
    await page.getByRole('button', { name: 'Lernen', exact: true }).click();
    const setup = page.getByTestId('study-setup');
    await setup.getByRole('radio', { name: 'Automatisch' }).click();
    await page.getByTestId('study-start').click();
    for (let i = 0; i < CARDS.length; i += 1) {
      const front = await prompt(page);
      await answer(page, FIRST_ROUND.get(front) ?? '', i < 2 ? 'presenting' : 'roundComplete');
    }
    await expect(page.getByTestId('study-complete')).toContainText('2 richtig · 1 falsch');
    expect(aiRequests.length).toBeGreaterThanOrEqual(1);

    // 5. Repeat the wrong card, now right: 100 %.
    await page.getByRole('button', { name: 'Falsche wiederholen (1)' }).click();
    await expect(phase(page)).toHaveAttribute('data-phase', 'presenting');
    expect(await prompt(page)).toBe('Vogel');
    await answer(page, 'bird', 'roundComplete');
    await expect(page.getByTestId('study-complete')).toHaveAttribute('data-percentage', '100');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/#\/projects\//);

    // 6. Statistics.
    await page.goto('./#/stats');
    await expect(page.getByTestId('stats-page')).toBeVisible();
    await expect(page.getByTestId('stats-projects')).toContainText('Tiere');

    // 7. Brain (test embedder, no download).
    await page.goto('./#/brain');
    await expect(page.getByTestId('brain-stats')).toHaveText(/^3 Karten/, { timeout: 20_000 });
    await expect(page.getByTestId('brain-graph')).toBeVisible();

    // 8. Export the project (JSON with history) and import it again as a new project.
    await page.goto('./#/projects');
    await page.getByRole('link', { name: 'Tiere öffnen' }).click();
    await expect(page.getByTestId('card-count')).toHaveText('3 Karten');
    await page.getByRole('button', { name: 'Exportieren' }).click();
    const exportDialog = page.getByRole('dialog', { name: '„Tiere“ exportieren' });
    await expect(exportDialog.getByTestId('export-file')).toContainText('.json');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportDialog.getByTestId('export-confirm').click(),
    ]);
    const json = await readFile(await download.path());
    const file = JSON.parse(json.toString('utf-8')) as { cards: unknown[]; answers: unknown[] };
    expect(file.cards).toHaveLength(3);
    expect(file.answers.length).toBeGreaterThanOrEqual(4);
    expect(json.toString('utf-8')).not.toContain('sk-ant-');

    await page.goto('./#/projects');
    await expect(page.getByRole('heading', { level: 1, name: 'Projekte' })).toBeVisible();
    await expect(page.getByTestId('import-file')).toHaveCount(1);
    await page.getByTestId('import-file').setInputFiles({
      name: download.suggestedFilename(),
      mimeType: 'application/json',
      buffer: json,
    });
    const importDialog = page.getByRole('dialog', { name: 'Synapse-Datei importieren' });
    await expect(importDialog.getByTestId('json-summary')).toHaveText('1 Projekt · 3 Karten');
    await importDialog.getByRole('radio', { name: 'Als neues Projekt' }).click();
    await importDialog.getByTestId('import-confirm').click();
    await expect(page.getByTestId('import-result')).toContainText(
      '„Tiere (2)“ angelegt (3 Karten)',
    );
    await page.getByRole('button', { name: 'Fertig' }).click();
    await page.getByRole('link', { name: 'Tiere (2) öffnen' }).click();
    await expect(page.getByTestId('card-count')).toHaveText('3 Karten');

    expect(modelRequests).toEqual([]);
    expect(problems).toEqual([]);
  });
});
