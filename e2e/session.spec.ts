import { expect, test, type Page } from '@playwright/test';

async function openSessionPlayground(page: Page) {
  await page.goto('./#/settings');
  await page.getByRole('switch', { name: 'Entwicklermodus' }).click();
  await page.goto('./#/dev/ui');
  await page.getByRole('button', { name: 'Demo-Daten laden' }).click();
  await page.getByTestId('project-count').filter({ hasText: '3' }).waitFor();
  const section = page.getByTestId('dev-section-session');
  await section.getByLabel('Projekt').selectOption({ label: 'Japanisch Grundwortschatz' });
  return section;
}

test('runs a study round locally, survives a reload and aborts', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') problems.push(message.text());
  });
  let apiCalls = 0;
  await page.route('https://api.anthropic.com/**', async (route) => {
    apiCalls += 1;
    await route.abort();
  });

  let section = await openSessionPlayground(page);
  const phase = () => section.getByTestId('session-phase');
  await expect(phase()).toHaveText('Bereit');
  await section.getByRole('button', { name: 'Runde starten' }).click();
  await expect(phase()).toHaveText('Frage');
  await expect(section.getByTestId('session-progress')).toHaveText('0 / 30');
  await expect(section.getByTestId('session-percentage')).toHaveText('0 %');

  // "keine Ahnung" is decided locally as wrong.
  await section.getByLabel('Deine Antwort').fill('keine Ahnung');
  await section.getByLabel('Deine Antwort').press('Enter');
  await expect(phase()).toHaveText('Aufgedeckt');
  await expect(section.getByTestId('session-verdict')).toHaveText('Falsch');
  await expect(section.getByTestId('session-piles')).toHaveText('0 richtig · 1 falsch');

  // Override moves the card to the right pile.
  await section.getByRole('button', { name: 'Doch richtig' }).click();
  await expect(section.getByTestId('session-verdict')).toHaveText('Richtig');
  await expect(section.getByTestId('session-method')).toHaveText('Korrigiert');
  await expect(section.getByTestId('session-percentage')).toHaveText('3 %');

  // The correct answer is decided locally as right.
  await section.getByRole('button', { name: 'Weiter' }).click();
  await expect(phase()).toHaveText('Frage');
  const prompt = await section.getByTestId('session-prompt').textContent();
  await section.getByLabel('Deine Antwort').fill('weiß nicht');
  await section.getByLabel('Deine Antwort').press('Enter');
  await expect(section.getByTestId('session-progress')).toHaveText('2 / 30');

  // A reload (as iOS does with a PWA in the background) keeps the round.
  await page.reload();
  section = page.getByTestId('dev-section-session');
  await section.getByLabel('Projekt').selectOption({ label: 'Japanisch Grundwortschatz' });
  await expect(phase()).toHaveText('Aufgedeckt');
  await expect(section.getByTestId('session-prompt')).toHaveText(prompt ?? '');
  await expect(section.getByTestId('session-piles')).toHaveText('1 richtig · 1 falsch');

  await section.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(phase()).toHaveText('Abgebrochen');
  await expect(section.getByRole('button', { name: 'Neue Runde' })).toBeVisible();

  expect(apiCalls).toBe(0);
  expect(problems).toEqual([]);
});

test('self assessment round to the end and repeat the wrong cards', async ({ page }) => {
  const section = await openSessionPlayground(page);
  await section.getByLabel('Projekt').selectOption({ label: 'Aktien & Börse' });
  await section.getByRole('radio', { name: 'Selbstbewertung' }).click();
  await section.getByRole('button', { name: 'Runde starten' }).click();
  const total = Number(
    (await section.getByTestId('session-progress').textContent())?.split('/')[1]?.trim(),
  );
  expect(total).toBeGreaterThan(0);
  for (let i = 0; i < total; i++) {
    await section.getByRole('button', { name: 'Absenden' }).click();
    await section.getByRole('button', { name: i < 3 ? 'Falsch' : 'Richtig', exact: true }).click();
    await section.getByRole('button', { name: 'Weiter' }).click();
  }
  await expect(section.getByTestId('session-phase')).toHaveText('Runde beendet');
  await expect(section.getByTestId('session-piles')).toHaveText(`${total - 3} richtig · 3 falsch`);

  await section.getByRole('button', { name: 'Falsche wiederholen' }).click();
  await expect(section.getByTestId('session-round')).toHaveText('2');
  await expect(section.getByTestId('session-progress')).toHaveText('0 / 3');
  await expect(section.getByTestId('session-percentage')).toHaveText('0 %');
});
