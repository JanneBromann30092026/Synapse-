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

/** Card count from the stats line under the title ("90 Karten · 12 Verbindungen · …"). */
const brainStats = (page: Page) => page.getByTestId('brain-stats');

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
  await expect(page.getByTestId('brain-graph')).toBeVisible();
  // BWL and stocks share terms such as Cashflow and Eigenkapitalquote: cross-project links.
  await expect(brainStats(page)).toHaveText(
    /^90 Karten · [1-9]\d* Verbindungen · [1-9]\d* projektübergreifend$/,
  );

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
  await expect(brainStats(page)).toHaveText(/^91 Karten/, { timeout: 20_000 });

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

type StoredPositions = Record<string, { x: number; y: number }>;

/** Reads graphPositions straight from IndexedDB. */
function readPositions(page: Page): Promise<StoredPositions> {
  return page.evaluate(
    () =>
      new Promise<StoredPositions>((resolve, reject) => {
        const open = indexedDB.open('synapse');
        open.onerror = () => reject(new Error('open failed'));
        open.onsuccess = () => {
          const request = open.result
            .transaction('graphPositions')
            .objectStore('graphPositions')
            .getAll();
          request.onsuccess = () => {
            const rows = request.result as { nodeId: string; x: number; y: number }[];
            resolve(Object.fromEntries(rows.map((r) => [r.nodeId, { x: r.x, y: r.y }])));
            open.result.close();
          };
        };
      }),
  );
}

async function openBrainWithTestEmbedder(page: Page) {
  await loadDemoData(page);
  await page.goto('./#/settings');
  await page
    .getByTestId('settings-brain')
    .getByRole('radio', { name: 'Test ohne Download' })
    .click();
  await expect(page.getByTestId('brain-settings-status')).toHaveText(
    /^90 von 90 Karten analysiert · [1-9]\d* Verbindungen$/,
    { timeout: 20_000 },
  );
  await page.goto('./#/brain');
  await expect(page.getByTestId('brain-graph')).toBeVisible();
  // The layout settles and is stored (90 cards + 3 hubs).
  await expect
    .poll(async () => Object.keys(await readPositions(page)).length, { timeout: 30_000 })
    .toBe(93);
  await page.waitForFunction(() => window.__synapseBrain?.engineRunning() === false);
}

async function nodeScreen(page: Page, id: string) {
  const canvas = await page.getByTestId('brain-graph').boundingBox();
  const point = await page.evaluate((nodeId) => window.__synapseBrain?.nodeScreen(nodeId), id);
  if (!canvas || !point) throw new Error('node not on screen');
  return { x: canvas.x + point.x, y: canvas.y + point.y };
}

test('brain graph: stable layout, node drag (mouse and long press), controls', async ({ page }) => {
  test.setTimeout(120_000);
  const problems = collectConsoleProblems(page);
  await openBrainWithTestEmbedder(page);

  // Stored layout is reused: a reload does not move anything.
  const before = await readPositions(page);
  await page.reload();
  await expect(page.getByTestId('brain-graph')).toBeVisible();
  await page.waitForFunction(() => window.__synapseBrain?.engineRunning() === false);
  await page.waitForTimeout(500);
  expect(await readPositions(page)).toEqual(before);

  // Mouse: drag a card directly; the new position is stored.
  const card = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const open = indexedDB.open('synapse');
        open.onsuccess = () => {
          const request = open.result.transaction('cards').objectStore('cards').getAllKeys();
          request.onsuccess = () => {
            resolve(request.result[5] as string);
            open.result.close();
          };
        };
      }),
  );
  const start = await nodeScreen(page, card);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 30, start.y + 10, { steps: 5 });
  await page.mouse.move(start.x + 60, start.y + 20, { steps: 5 });
  await page.mouse.up();
  const k = await page.evaluate(() => window.__synapseBrain?.zoom() ?? 1);
  await expect
    .poll(async () => (await readPositions(page))[card]?.x ?? 0)
    .toBeCloseTo((before[card]?.x ?? 0) + 60 / k, 0);

  // Touch: one finger pans (node stays), long press + drag moves the node.
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
    });
  const moved = (await readPositions(page))[card];
  const p1 = await nodeScreen(page, card);
  await touch('touchStart', p1.x, p1.y);
  for (let i = 1; i <= 5; i++) await touch('touchMove', p1.x + i * 12, p1.y);
  await touch('touchEnd');
  await page.waitForTimeout(300);
  expect((await readPositions(page))[card]).toEqual(moved);
  const p2 = await nodeScreen(page, card);
  expect(p2.x).toBeGreaterThan(p1.x + 30); // the whole view moved

  await touch('touchStart', p2.x, p2.y);
  await page.waitForTimeout(600);
  for (let i = 1; i <= 5; i++) await touch('touchMove', p2.x, p2.y + i * 8);
  await touch('touchEnd');
  await expect
    .poll(async () => (await readPositions(page))[card]?.y ?? 0)
    .toBeGreaterThan((moved?.y ?? 0) + 20 / k);
  const p3 = await nodeScreen(page, card);
  expect(Math.abs(p3.x - p2.x)).toBeLessThan(2); // no panning while dragging the node

  // Controls: zoom, fit, legend, full screen.
  const zoom = () => page.evaluate(() => window.__synapseBrain?.zoom() ?? 0);
  const k0 = await zoom();
  await page.getByRole('button', { name: 'Hineinzoomen' }).click();
  await expect.poll(zoom).toBeGreaterThan(k0 * 1.4);
  await page.getByRole('button', { name: 'Alles einpassen' }).click();
  await expect.poll(zoom).toBeLessThan(k0 * 1.2);
  await page.getByRole('button', { name: 'Legende' }).click();
  await expect(page.getByTestId('brain-legend')).toContainText('Projektübergreifend');
  await expect(page.getByTestId('brain-legend')).toContainText('Japanisch Grundwortschatz');
  await page.getByRole('button', { name: 'Vollbild', exact: true }).click();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await page.getByRole('button', { name: 'Vollbild beenden' }).click();
  await expect(page.getByRole('navigation').first()).toBeVisible();

  // Rearrange (with confirmation): new positions are stored.
  const arranged = await readPositions(page);
  await page.getByRole('button', { name: 'Neu anordnen' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Gehirn neu anordnen?' });
  await dialog.getByRole('button', { name: 'Neu anordnen' }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(async () => (await readPositions(page))[card], { timeout: 30_000 })
    .not.toEqual(arranged[card]);

  expect(problems).toEqual([]);
});

test('brain graph: frame times with synthetic data (developer mode)', async ({ page }, info) => {
  test.setTimeout(120_000);
  const problems = collectConsoleProblems(page);
  await page.goto('./#/settings');
  await page.getByRole('switch', { name: 'Entwicklermodus' }).click();
  for (const size of [2000, 3000]) {
    await page.goto(`./#/brain?synthetic=${size}`);
    await expect(page.getByTestId('brain-synthetic')).toContainText(
      `${size.toLocaleString('de-DE')} Knoten`,
    );
    await page.waitForFunction((n) => (window.__synapseBrain?.nodes ?? 0) > n, size);
    await page.evaluate(() => window.__synapseBrain?.reset());
    // Pan for a while (the simulation may still be running).
    const box = await page.getByTestId('brain-graph').boundingBox();
    if (!box) throw new Error('no canvas');
    await page.mouse.move(box.x + 40, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 0; i < 40; i++) {
      await page.mouse.move(box.x + 40 + i * 6, box.y + box.height / 2 + Math.sin(i / 4) * 40);
    }
    await page.mouse.up();
    const stats = await page.evaluate(() => ({
      draw: window.__synapseBrain?.draw(),
      interval: window.__synapseBrain?.interval(),
    }));
    const line = `${size} Knoten: Zeichnen Ø ${stats.draw?.mean.toFixed(1)} ms, p95 ${stats.draw?.p95.toFixed(1)} ms; Frameabstand p50 ${stats.interval?.p50.toFixed(1)} ms`;
    info.annotations.push({ type: 'frames', description: line });
    console.log(line);
    expect(stats.draw?.count ?? 0).toBeGreaterThan(5);
    // Own drawing code only (the cloud container rasterizes the canvas in software).
    expect(stats.draw?.p95 ?? Infinity).toBeLessThan(40);
  }
  // Synthetic data is never stored.
  expect(Object.keys(await readPositions(page))).toEqual([]);
  await page.getByRole('button', { name: 'Testdaten' }).click();
  await page.getByRole('menuitem', { name: 'Echte Daten' }).click();
  await expect(page.getByText('Das Gehirn wächst noch')).toBeVisible();
  expect(problems).toEqual([]);
});
