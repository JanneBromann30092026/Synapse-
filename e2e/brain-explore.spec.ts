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

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'content-type': 'application/json',
};

async function setup(page: Page) {
  await page.goto('./#/settings');
  const toggle = page.getByRole('switch', { name: 'Entwicklermodus' });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await page.goto('./#/dev/ui');
  await page.getByRole('button', { name: 'Demo-Daten laden' }).click();
  await expect(page.getByText(/Projekte mit \d+ Karten angelegt/)).toBeVisible();
  await page.goto('./#/settings');
  const brain = page.getByTestId('settings-brain');
  await brain.getByRole('radio', { name: 'Test ohne Download' }).click();
  // Lower threshold: enough links (also across projects) to explore.
  await brain.getByRole('slider', { name: 'Ähnlichkeitsschwelle' }).focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('PageDown');
  await expect(page.getByTestId('brain-settings-status')).toHaveText(
    /^90 von 90 Karten analysiert · [1-9]\d+ Verbindungen$/,
    { timeout: 20_000 },
  );
}

async function openBrain(page: Page) {
  await page.goto('./#/brain');
  await expect(page.getByTestId('brain-graph')).toBeVisible();
  await page.waitForFunction(() => window.__synapseBrain?.engineRunning() === false, null, {
    timeout: 30_000,
  });
  await page.waitForTimeout(300);
}

/** Screen point of a node or link (developer hook + canvas offset). */
async function screenOf(page: Page, kind: 'node' | 'link', id: string) {
  const canvas = await page.getByTestId('brain-graph').boundingBox();
  const point = await page.evaluate(
    ([k, i]) =>
      k === 'node' ? window.__synapseBrain?.nodeScreen(i) : window.__synapseBrain?.linkScreen(i),
    [kind, id] as const,
  );
  if (!canvas || !point) throw new Error(`${kind} not on screen`);
  return { x: canvas.x + point.x, y: canvas.y + point.y };
}

async function waitForCamera(page: Page) {
  await page.waitForFunction(() => window.__synapseBrain?.cameraMoving() === false);
}

/** Best connected card that also has a cross-project link. */
async function hubCard(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const links = window.__synapseBrain?.cardLinks() ?? [];
    const degree = new Map<string, number>();
    for (const link of links) {
      for (const end of [link.a, link.b]) degree.set(end, (degree.get(end) ?? 0) + 1);
    }
    const cross = new Set(links.filter((l) => l.cross).flatMap((l) => [l.a, l.b]));
    return [...cross].sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0))[0];
  });
  if (!id) throw new Error('no cross-project link');
  return id;
}

function manualLinks(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('synapse');
        open.onsuccess = () => {
          const request = open.result.transaction('cardLinks').objectStore('cardLinks').getAll();
          request.onsuccess = () => {
            resolve(
              (request.result as { kind: string }[]).filter((l) => l.kind === 'manual').length,
            );
            open.result.close();
          };
        };
      }),
  );
}

test('brain: focus mode, panel, manual link, link popover, hub, keyboard', async ({ page }) => {
  test.setTimeout(150_000);
  const problems = collectConsoleProblems(page);
  await setup(page);
  await openBrain(page);

  // Tap a card: camera flies there, the detail panel shows the card and its neighbors.
  const id = await hubCard(page);
  let point = await screenOf(page, 'node', id);
  await page.mouse.click(point.x, point.y);
  const panel = page.getByTestId('brain-card-panel');
  await expect(panel).toBeVisible();
  const links = panel.getByTestId('brain-card-links').getByRole('button');
  await expect(links.first()).toBeVisible();
  await expect(panel.locator('[data-cross]').first()).toBeVisible();
  await waitForCamera(page);
  const title = (await panel.getByRole('heading', { level: 2 }).textContent()) ?? '';

  // Tapping a linked card jumps there.
  const neighbor = (await links.first().getAttribute('aria-label'))?.match(/„(.+)“/)?.[1] ?? '';
  await links.first().click();
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText(neighbor);
  await waitForCamera(page);

  // Arrow keys move to a neighbor in focus mode.
  const before = await panel.getByRole('heading', { level: 2 }).textContent();
  let moved = false;
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
    if ((await panel.getByRole('heading', { level: 2 }).textContent()) !== before) {
      moved = true;
      break;
    }
  }
  expect(moved).toBe(true);

  // Esc closes the panel; F fits everything.
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await page.keyboard.press('f');
  await waitForCamera(page);

  // Search (⌘K) → fly to the card and focus it.
  await page.keyboard.press('Meta+k');
  const search = page.getByTestId('brain-search-input');
  await expect(search).toBeFocused();
  await search.fill(title.slice(0, 6));
  await expect(page.getByTestId('brain-search-results').getByRole('option').first()).toBeVisible();
  await page
    .getByTestId('brain-search-results')
    .getByRole('option')
    .filter({ hasText: title })
    .first()
    .click();
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText(title);
  await waitForCamera(page);

  // Manual link: search the target across all projects; the link appears in the panel.
  await panel.getByTestId('brain-add-link').click();
  const picker = page.getByRole('dialog', { name: 'Verbindung hinzufügen' });
  await picker.getByLabel('Zielkarte suchen').fill('Hund');
  await picker.getByRole('button', { name: /Hund/ }).first().click();
  await expect(page.getByText('Verbindung hinzugefügt')).toBeVisible();
  await expect(picker).toBeHidden();
  await expect(panel.getByTestId('brain-card-links')).toContainText('Manuell');
  expect(await manualLinks(page)).toBe(1);

  // Link popover: tap the manual link; without AI the explanation is disabled with a reason.
  await page.keyboard.press('Escape');
  await page.keyboard.press('f');
  await waitForCamera(page);
  const manual = await page.evaluate(
    () => window.__synapseBrain?.cardLinks().find((l) => l.kind === 'manual')?.id ?? '',
  );
  point = await screenOf(page, 'link', manual);
  await page.mouse.click(point.x, point.y);
  const popover = page.getByTestId('brain-link-popover');
  await expect(popover).toBeVisible();
  await expect(popover.getByTestId('brain-link-why')).toBeDisabled();
  await expect(popover).toContainText('Erklärungen brauchen die KI');
  await popover.getByTestId('brain-link-remove').click();
  await expect(popover).toBeHidden();
  await expect.poll(() => manualLinks(page)).toBe(0);

  // A real finger tap (touch events) selects a card as well; tapping the background closes it.
  await page.keyboard.press('f');
  await waitForCamera(page);
  point = await screenOf(page, 'node', id);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: point.x, y: point.y }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(panel).toBeVisible();
  await waitForCamera(page);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await page.keyboard.press('f');
  await waitForCamera(page);

  // Project hub: panel with card count and partner projects, "Projekt lernen".
  const hub = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const open = indexedDB.open('synapse');
        open.onsuccess = () => {
          const request = open.result.transaction('projects').objectStore('projects').getAll();
          request.onsuccess = () => {
            const rows = request.result as { id: string; name: string }[];
            resolve(rows.find((p) => p.name === 'BWL-Grundbegriffe')?.id ?? '');
            open.result.close();
          };
        };
      }),
  );
  point = await screenOf(page, 'node', hub);
  await page.mouse.click(point.x, point.y);
  const hubPanel = page.getByTestId('brain-hub-panel');
  await expect(hubPanel).toBeVisible();
  await expect(hubPanel.getByTestId('brain-hub-cards')).toHaveText('30 Karten');
  await expect(hubPanel.getByTestId('brain-hub-cross')).toHaveText(/\d+ Verbindung/);
  await hubPanel.getByTestId('brain-study-project').click();
  await expect(page).toHaveURL(new RegExp(`#/study/${hub}`));

  expect(problems.filter((p) => !p.includes('Service Worker'))).toEqual([]);
});

test('brain: filter is saved, neighborhood round, explanation with mocked AI', async ({ page }) => {
  test.setTimeout(150_000);
  const problems = collectConsoleProblems(page);
  const requests: unknown[] = [];
  await page.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        headers: CORS,
        body: JSON.stringify({ type: 'model', id: 'claude-haiku-4-5-20251001', display_name: 'H' }),
      });
      return;
    }
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      headers: CORS,
      body: JSON.stringify({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-haiku-4-5-20251001',
        content: [{ type: 'text', text: 'Beide hängen am Eigenkapital. Mehr steht hier nicht.' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
    });
  });
  await setup(page);
  const ai = page.getByTestId('settings-ai');
  await ai.getByRole('radio', { name: 'Anthropic' }).click();
  await ai.getByLabel('API-Key', { exact: true }).fill('sk-ant-api03-test-0123456789abcdef');
  await ai.getByRole('button', { name: 'Key speichern' }).click();
  await expect(ai.getByTestId('api-key-status')).toHaveText(/Key hinterlegt/);
  await openBrain(page);

  // Filter: hide a project and keep only cross-project links; saved across reloads.
  await page.getByTestId('brain-filter-toggle').click();
  const filter = page.getByTestId('brain-filter');
  await filter.getByTestId('brain-filter-project').filter({ hasText: 'Japanisch' }).click();
  await filter.getByRole('switch', { name: 'Nur projektübergreifende Verbindungen' }).click();
  await expect(page.getByTestId('brain-filter-count')).toHaveText('2');
  const visibleLinks = await page.evaluate(() => window.__synapseBrain?.cardLinks() ?? []);
  expect(visibleLinks.length).toBeGreaterThan(0);
  expect(visibleLinks.every((l) => l.cross)).toBe(true);
  await page.reload();
  await openBrain(page);
  await expect(page.getByTestId('brain-filter-count')).toHaveText('2');
  expect(
    (await page.evaluate(() => window.__synapseBrain?.cardLinks() ?? [])).every((l) => l.cross),
  ).toBe(true);

  // Cross-project link: explanation via the (mocked) AI, then cached.
  const link = await page.evaluate(
    () => window.__synapseBrain?.cardLinks().find((l) => l.cross)?.id ?? '',
  );
  let point = await screenOf(page, 'link', link);
  await page.mouse.click(point.x, point.y);
  const popover = page.getByTestId('brain-link-popover');
  await expect(popover.getByTestId('brain-link-similarity')).toContainText('% Ähnlichkeit');
  await popover.getByTestId('brain-link-why').click();
  await expect(popover.getByTestId('brain-link-explanation')).toHaveText(
    'Beide hängen am Eigenkapital. Mehr steht hier nicht.',
  );
  expect(requests).toHaveLength(1);
  expect(JSON.stringify(requests[0])).not.toContain('"tools"');
  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
  point = await screenOf(page, 'link', link);
  await page.mouse.click(point.x, point.y);
  await expect(popover.getByTestId('brain-link-explanation')).toBeVisible();
  expect(requests).toHaveLength(1);

  // Reset the filter; "Nachbarschaft lernen" starts a cross-project round with the neighbors.
  await page.keyboard.press('Escape');
  await page.getByTestId('brain-filter-toggle').click();
  await page.getByTestId('brain-filter').getByRole('button', { name: 'Zurücksetzen' }).click();
  await expect(page.getByTestId('brain-filter-count')).toBeHidden();
  await page.getByTestId('brain-filter-toggle').click();
  const id = await hubCard(page);
  point = await screenOf(page, 'node', id);
  await page.mouse.click(point.x, point.y);
  const panel = page.getByTestId('brain-card-panel');
  await expect(panel.getByText(/Diese Karte und \d+ Nachbarn/)).toBeVisible();
  await panel.getByTestId('brain-study-neighborhood').click();
  await expect(page).toHaveURL(new RegExp(`#/study/cross\\?cards=${id},`));

  expect(problems.filter((p) => !p.includes('Service Worker'))).toEqual([]);
});
