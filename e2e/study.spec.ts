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

const CARDS = [
  { front: 'Hund', back: 'dog' },
  { front: 'Katze', back: 'cat' },
  { front: 'Vogel', back: 'bird' },
];
const ANSWERS = new Map(CARDS.map((card) => [card.front, card.back]));

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

/** Fake Anthropic API (never a real call): grades every request as correct, or fails. */
async function mockAnthropic(page: Page, mode: 'correct' | 'fail') {
  const requests: unknown[] = [];
  await page.route('https://api.anthropic.com/**', async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    requests.push(request.postDataJSON());
    if (mode === 'fail') {
      await route.fulfill({
        status: 500,
        headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'boom' } }),
      });
      return;
    }
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
            input: { feedback: 'Stimmt – das trifft es.', verdict: 'correct', confidence: 0.9 },
          },
        ],
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
    });
  });
  return requests;
}

async function enableAi(page: Page) {
  await page.goto('./#/settings');
  const ai = page.getByTestId('settings-ai');
  await ai.getByRole('radio', { name: 'Anthropic' }).click();
  await ai.getByLabel('API-Key', { exact: true }).fill('sk-ant-api03-e2e-0123456789abcdefghij');
  await ai.getByRole('button', { name: 'Key speichern' }).click();
  await expect(ai.getByTestId('api-key-status')).toHaveText('Key hinterlegt');
}

/** Creates the project "Tiere" with three cards and opens it. */
async function createProject(page: Page) {
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
}

async function startRound(page: Page, gradingMode: 'Automatisch' | 'Selbstbewertung') {
  await page.getByRole('button', { name: 'Lernen', exact: true }).click();
  await expect(page).toHaveURL(/#\/study\//);
  const setup = page.getByTestId('study-setup');
  await expect(setup).toBeVisible();
  await setup.getByRole('radio', { name: gradingMode }).click();
  await page.getByTestId('study-start').click();
  await expect(page.getByTestId('study-surface')).toHaveAttribute('data-phase', 'presenting');
  await expect(page.getByTestId('study-input')).toBeFocused();
}

const phase = (page: Page) => page.getByTestId('study-surface');
const prompt = async (page: Page) =>
  (await page.getByTestId('study-card').last().getByTestId('study-prompt').textContent()) ?? '';

/** Enter on the revealed card: it flies onto its pile, then the next card (or the end). */
async function next(page: Page, expected: 'presenting' | 'roundComplete') {
  await page.getByTestId('study-input').press('Enter');
  await expect(phase(page)).toHaveAttribute('data-phase', expected);
}

test('self assessment: a whole round by button, key and swipe', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  let apiCalls = 0;
  await page.route('https://api.anthropic.com/**', async (route) => {
    apiCalls += 1;
    await route.abort();
  });
  await createProject(page);
  await startRound(page, 'Selbstbewertung');

  // Focus mode: no navigation on the study surface.
  await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toHaveCount(0);
  await expect(page.getByTestId('study-position')).toContainText('Runde 1 · 1 / 3');

  // 1: reveal without typing, "Gewusst" by button.
  await page.getByRole('button', { name: 'Aufdecken' }).click();
  await expect(phase(page)).toHaveAttribute('data-phase', 'selfAssessing');
  await expect(page.getByTestId('study-card').last()).toHaveAttribute('data-flipped', 'true');
  await expect(page.getByTestId('study-user-answer')).toHaveText('(keine Eingabe)');
  await page.getByRole('button', { name: 'Gewusst', exact: true }).click();
  await expect(page.getByTestId('study-pile-correct-count')).toHaveText('1');
  await expect(phase(page)).toHaveAttribute('data-phase', 'presenting');
  await expect(page.getByTestId('study-input')).toBeFocused();

  // 2: typed answer, "Nicht gewusst" by hardware key F.
  await page.getByTestId('study-input').fill('keine Idee');
  await page.getByTestId('study-input').press('Enter');
  await expect(phase(page)).toHaveAttribute('data-phase', 'selfAssessing');
  await page.keyboard.press('f');
  await expect(page.getByTestId('study-pile-incorrect-count')).toHaveText('1');
  await expect(phase(page)).toHaveAttribute('data-phase', 'presenting');

  // 3: swipe the card to the right = known.
  await page.getByRole('button', { name: 'Aufdecken' }).click();
  await expect(phase(page)).toHaveAttribute('data-phase', 'selfAssessing');
  const box = await page.getByTestId('study-card').last().boundingBox();
  if (!box) throw new Error('card not visible');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 + i * 25, y);
  await page.mouse.up();

  await expect(phase(page)).toHaveAttribute('data-phase', 'roundComplete');
  await expect(page.getByTestId('study-complete')).toContainText('2 richtig · 1 falsch');
  await expect(
    page.getByRole('progressbar', { name: 'Rundenstatus (richtig)' }).last(),
  ).toHaveAttribute('aria-valuenow', '67');

  // Back to the project (reverse transition), navigation is back.
  await page.getByRole('button', { name: 'Zurück zum Projekt' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tiere' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeVisible();

  expect(apiCalls).toBe(0);
  expect(problems).toEqual([]);
});

test('automatic grading: local, override and a mocked AI verdict', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  const requests = await mockAnthropic(page, 'correct');
  await enableAi(page);
  await createProject(page);
  await startRound(page, 'Automatisch');
  await expect(page.getByTestId('study-setup')).toHaveCount(0);

  // Correct answer: decided locally, then corrected with O.
  await page.getByTestId('study-input').fill(ANSWERS.get(await prompt(page)) ?? '');
  await page.getByTestId('study-input').press('Enter');
  await expect(phase(page)).toHaveAttribute('data-phase', 'revealed');
  await expect(page.getByTestId('study-result')).toHaveAttribute('data-verdict', 'correct');
  await expect(page.getByTestId('study-method')).toHaveText('Exakt');
  await page.getByTestId('study-input').press('o');
  await expect(page.getByTestId('study-result')).toHaveAttribute('data-verdict', 'incorrect');
  await expect(page.getByTestId('study-method')).toHaveText('Korrigiert');
  await next(page, 'presenting');
  await expect(page.getByTestId('study-pile-incorrect-count')).toHaveText('1');

  // "keine Ahnung" is wrong without asking anyone.
  await page.getByTestId('study-input').fill('keine Ahnung');
  await page.getByTestId('study-input').press('Enter');
  await expect(page.getByTestId('study-method')).toHaveText('Lokal erkannt');
  await page.getByRole('button', { name: 'Doch richtig' }).click();
  await expect(page.getByTestId('study-result')).toHaveAttribute('data-verdict', 'correct');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(phase(page)).toHaveAttribute('data-phase', 'presenting');

  // Unclear answer: the (mocked) AI decides and explains.
  await page.getByTestId('study-input').fill('ein Tier mit Fell');
  await page.getByTestId('study-input').press('Enter');
  await expect(page.getByTestId('study-method')).toHaveText('KI');
  await expect(page.getByTestId('study-feedback')).toHaveText('Stimmt – das trifft es.');
  expect(requests).toHaveLength(1);
  await next(page, 'roundComplete');
  await expect(page.getByTestId('study-complete')).toContainText('2 richtig · 1 falsch');
  expect(problems).toEqual([]);
});

test('AI failure switches to self assessment with a hint; quit asks first', async ({ page }) => {
  await mockAnthropic(page, 'fail');
  await enableAi(page);
  await createProject(page);
  await startRound(page, 'Automatisch');

  await page.getByTestId('study-input').fill('ein Tier mit Fell');
  await page.getByTestId('study-input').press('Enter');
  await expect(phase(page)).toHaveAttribute('data-phase', 'selfAssessing');
  await expect(page.getByText('KI nicht erreichbar')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('study-pile-correct-count')).toHaveText('1');

  // Esc asks before quitting; the answers stay.
  await page.keyboard.press('Escape');
  const dialog = page.getByRole('alertdialog', { name: 'Runde beenden?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Beenden' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tiere' })).toBeVisible();

  // The next visit starts with the setup again.
  await page.getByRole('button', { name: 'Lernen', exact: true }).click();
  await expect(page.getByTestId('study-setup')).toBeVisible();
});

/** All study sessions and answers straight from IndexedDB (oldest round first). */
async function readStudyLog(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{
        sessions: {
          roundNumber: number;
          mode: string;
          totalCards: number;
          correctCount: number;
          incorrectCount: number;
          aborted: boolean;
          finishedAt?: string;
        }[];
        answers: { sessionId: string; verdict: string }[];
      }>((resolve, reject) => {
        const open = indexedDB.open('synapse');
        open.onerror = () => reject(new Error('open failed'));
        open.onsuccess = () => {
          const tx = open.result.transaction(['studySessions', 'answers'], 'readonly');
          const sessions = tx.objectStore('studySessions').getAll();
          const answers = tx.objectStore('answers').getAll();
          tx.oncomplete = () => {
            open.result.close();
            resolve({
              sessions: (sessions.result as { roundNumber: number }[]).sort(
                (a, b) => a.roundNumber - b.roundNumber,
              ) as never,
              answers: answers.result as never,
            });
          };
        };
      }),
  );
}

/** Self assessment of the current card by hardware key (R = known, F = not known). */
async function selfAnswer(page: Page, known: boolean, expected: 'presenting' | 'roundComplete') {
  await page.getByRole('button', { name: 'Aufdecken' }).click();
  await expect(phase(page)).toHaveAttribute('data-phase', 'selfAssessing');
  await page.keyboard.press(known ? 'r' : 'f');
  await expect(phase(page)).toHaveAttribute('data-phase', expected);
}

test('round end: summary, repeating wrong / all cards and the stored history', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  let apiCalls = 0;
  await page.route('https://api.anthropic.com/**', async (route) => {
    apiCalls += 1;
    await route.abort();
  });
  await createProject(page);
  await startRound(page, 'Selbstbewertung');

  // Round 1: one known, two not known.
  await selfAnswer(page, true, 'presenting');
  await selfAnswer(page, false, 'presenting');
  await selfAnswer(page, false, 'roundComplete');

  const summary = page.getByTestId('study-complete');
  await expect(summary).toHaveAttribute('data-percentage', '33');
  await expect(summary.getByRole('heading', { name: 'Runde 1 geschafft' })).toBeVisible();
  const tiles = page.getByTestId('study-complete-tiles');
  await expect(tiles.getByRole('definition')).toHaveText([
    '1',
    '2',
    '3',
    /^\d+ s$|^\d+:\d\d min$/,
    /^\d+(,\d)? s$/,
  ]);
  await expect(page.getByTestId('study-motivation')).not.toBeEmpty();
  await expect(page.getByTestId('study-input')).not.toBeFocused();
  // Wrong answers are listed open, right ones folded.
  await expect(page.getByTestId('study-list-incorrect').getByTestId('study-list-item')).toHaveCount(
    2,
  );
  await expect(page.getByTestId('study-list-incorrect')).toContainText('(keine Eingabe)');
  const rightList = page.getByTestId('study-list-correct');
  await expect(rightList.getByTestId('study-list-item')).toHaveCount(0);
  await rightList.getByRole('button', { name: /Richtig beantwortet/ }).click();
  await expect(rightList.getByTestId('study-list-item')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Falsche wiederholen (2)' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Richtige wiederholen (1)' })).toBeEnabled();

  // Key 1: round 2 with the two wrong cards, round status back to 0 %.
  await page.keyboard.press('1');
  await expect(phase(page)).toHaveAttribute('data-phase', 'presenting');
  await expect(page.getByTestId('study-complete')).toHaveCount(0);
  await expect(page.getByTestId('study-position')).toContainText('Runde 2 · 1 / 2');
  await expect(page.getByTestId('study-input')).toBeFocused();
  await expect(page.getByTestId('study-pile-correct-count')).toHaveText('0');
  await expect(page.getByRole('progressbar', { name: 'Rundenstatus (richtig)' })).toHaveAttribute(
    'aria-valuenow',
    '0',
  );

  // Round 2: all known → 100 % with confetti; nothing wrong to repeat.
  await selfAnswer(page, true, 'presenting');
  await selfAnswer(page, true, 'roundComplete');
  await expect(summary).toHaveAttribute('data-percentage', '100');
  await expect(summary.getByRole('heading', { name: 'Runde 2 geschafft' })).toBeVisible();
  await expect(page.getByTestId('confetti')).toBeAttached();
  await expect(page.getByRole('button', { name: 'Falsche wiederholen (0)' })).toBeDisabled();
  await expect(page.getByText('Keine falschen Karten – alles richtig.')).toBeVisible();
  await page.keyboard.press('1'); // empty pile: stays on the summary
  await expect(phase(page)).toHaveAttribute('data-phase', 'roundComplete');

  // "Alle wiederholen": round 3 with both cards of round 2, then quit after one answer.
  await page.getByRole('button', { name: 'Alle wiederholen' }).click();
  await expect(page.getByTestId('study-position')).toContainText('Runde 3 · 1 / 2');
  await selfAnswer(page, true, 'presenting');
  await page.keyboard.press('Escape');
  await page
    .getByRole('alertdialog', { name: 'Runde beenden?' })
    .getByRole('button', { name: 'Beenden' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tiere' })).toBeVisible();

  // The project shows the last completed round (the aborted one does not count).
  await expect(page.getByTestId('last-round')).toHaveText(/^Letzte Runde: 100 % · /);

  const log = await readStudyLog(page);
  expect(
    log.sessions.map(
      ({ roundNumber, mode, totalCards, correctCount, incorrectCount, aborted }) => ({
        roundNumber,
        mode,
        totalCards,
        correctCount,
        incorrectCount,
        aborted,
      }),
    ),
  ).toEqual([
    {
      // New cards: the first round is the spaced-repetition round "Fällig".
      roundNumber: 1,
      mode: 'due',
      totalCards: 3,
      correctCount: 1,
      incorrectCount: 2,
      aborted: false,
    },
    {
      roundNumber: 2,
      mode: 'wrong',
      totalCards: 2,
      correctCount: 2,
      incorrectCount: 0,
      aborted: false,
    },
    {
      roundNumber: 3,
      mode: 'all',
      totalCards: 2,
      correctCount: 1,
      incorrectCount: 0,
      aborted: true,
    },
  ]);
  expect(log.sessions.every((session) => session.finishedAt)).toBe(true);
  // Every answer is logged, also the one of the aborted round.
  expect(log.answers).toHaveLength(6);

  expect(apiCalls).toBe(0);
  expect(problems).toEqual([]);
});
