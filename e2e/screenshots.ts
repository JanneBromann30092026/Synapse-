/**
 * Creates iPad screenshots of the production build (vite preview).
 * Usage: npm run screenshots  →  screenshots/*.png (SHOTS=study for one group)
 */
import { mkdirSync } from 'node:fs';
import { chromium, type BrowserContextOptions, type Page } from '@playwright/test';
import { preview } from 'vite';
import { IPAD_LANDSCAPE, IPAD_PORTRAIT, PREVIEW_URL } from './ipad.ts';

interface Shot {
  /** Hash route, e.g. "/projects". */
  route: string;
  name: string;
  /** Optional interaction before the screenshot (e.g. opening a dialog). */
  prepare?: (page: Page) => Promise<void>;
  /** Additionally screenshot the rest of the scrolling page in viewport-sized steps. */
  scroll?: boolean;
}

async function enableDevModeWithDemoData(page: Page) {
  await page.goto(`${PREVIEW_URL}#/settings`);
  const toggle = page.getByRole('switch', { name: 'Entwicklermodus' });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await page.goto(`${PREVIEW_URL}#/dev/ui`);
  await page.getByRole('button', { name: 'Demo-Daten laden' }).click();
  await page.getByTestId('project-count').filter({ hasText: '3' }).waitFor();
  // The cards of the last project are written after the project itself.
  await page.getByText(/Projekte mit \d+ Karten angelegt|schon vorhanden/).waitFor();
}

const openProject = (name: string) => async (page: Page) => {
  await page.getByRole('link', { name: `${name} öffnen` }).click();
  await page.getByRole('heading', { level: 1, name }).waitFor();
  await page.waitForTimeout(400);
};

async function openGridView(page: Page) {
  await openProject('BWL-Grundbegriffe')(page);
  await page.getByRole('button', { name: 'Rasteransicht' }).click();
  await page.waitForTimeout(400);
  await page.getByTestId('card-tile').nth(1).getByRole('button').first().click();
}

async function openEditorWithCounter(page: Page) {
  await openProject('Japanisch Grundwortschatz')(page);
  await page.getByRole('button', { name: 'Karte hinzufügen' }).click();
  await page.getByTestId('card-front').fill('魚');
  await page.getByTestId('card-back').fill('Fisch');
  await page.getByRole('button', { name: 'Speichern & nächste' }).click();
  await page.getByText('1 Karte in dieser Sitzung hinzugefügt').waitFor();
  await page.getByTestId('card-front').fill('鳥');
  await page.getByTestId('card-back').fill('Vogel; Huhn');
  await page.getByRole('button', { name: 'Notizen oder Kontext hinzufügen' }).click();
  await page.getByLabel('Notizen / Kontext').fill('とり · tori');
}

async function openDuplicateWarning(page: Page) {
  await openProject('Japanisch Grundwortschatz')(page);
  await page.getByRole('button', { name: 'Karte hinzufügen' }).click();
  await page.getByTestId('card-front').fill('犬');
  await page.getByTestId('card-back').fill('Hund');
  await page.getByRole('button', { name: 'Speichern & nächste' }).click();
  await page.getByRole('button', { name: 'Trotzdem speichern' }).waitFor();
}

async function selectCards(page: Page) {
  await openProject('Aktien & Börse')(page);
  await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
  for (const index of [0, 2, 3]) {
    await page.getByTestId('card-row').nth(index).getByRole('button').first().click();
  }
}

async function swipeRow(page: Page) {
  await openProject('Aktien & Börse')(page);
  const row = await page.getByTestId('card-row').nth(1).boundingBox();
  if (!row) return;
  // Real touch events (like a finger on the iPad).
  const cdp = await page.context().newCDPSession(page);
  const y = row.y + row.height / 2;
  const startX = row.x + row.width * 0.6;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: startX, y }],
  });
  for (let i = 1; i <= 12; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: startX - (200 * i) / 12, y }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Saves a test key and runs the connection test against a mocked API (no real call). */
async function settingsWithKey(page: Page) {
  await page.route('https://api.anthropic.com/**', async (route) => {
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'content-type': 'application/json',
    };
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    await route.fulfill({
      status: 200,
      headers,
      body: JSON.stringify({
        type: 'model',
        id: 'claude-haiku-4-5-20251001',
        display_name: 'Claude Haiku 4.5',
        created_at: '2025-10-01T00:00:00Z',
      }),
    });
  });
  const ai = page.getByTestId('settings-ai');
  await ai.getByRole('radio', { name: 'Anthropic' }).click();
  await ai.getByLabel('API-Key', { exact: true }).fill('sk-ant-api03-screenshot-0123456789abcdef');
  await ai.getByRole('button', { name: 'Key speichern' }).click();
  await ai.getByTestId('api-key-status').filter({ hasText: 'Key hinterlegt' }).waitFor();
  await ai.getByRole('button', { name: 'Verbindung testen' }).click();
  await ai.getByTestId('connection-result').waitFor();
  await page.waitForTimeout(3000); // let the toast disappear
}

/** Grading playground in the developer area: a typo that is still accepted (AI off). */
async function gradingPlayground(page: Page) {
  await page.goto(`${PREVIEW_URL}#/settings`);
  await page.getByTestId('settings-ai').getByRole('radio', { name: 'Aus' }).click();
  await page.goto(`${PREVIEW_URL}#/dev/ui`);
  const section = page.getByTestId('dev-section-grading');
  await section.getByLabel('Projekt').selectOption({ label: 'Japanisch Grundwortschatz' });
  await section.getByLabel('Karte').selectOption({ label: '家 → Haus; Heim; Zuhause' });
  await section.getByLabel('Deine Antwort').fill('Zuhaus');
  await section.getByRole('button', { name: 'Bewerten' }).click();
  await section.getByTestId('grading-result').waitFor();
  await section.evaluate((element) => element.scrollIntoView({ block: 'start' }));
}

/** Study round state machine in the developer area: a revealed wrong answer. */
async function sessionPlayground(page: Page) {
  const section = page.getByTestId('dev-section-session');
  await section.getByLabel('Projekt').selectOption({ label: 'Japanisch Grundwortschatz' });
  await section.getByRole('button', { name: 'Runde starten' }).click();
  await section.getByLabel('Deine Antwort').fill('keine Ahnung');
  await section.getByLabel('Deine Antwort').press('Enter');
  await section.getByTestId('session-result').waitFor();
  await section.evaluate((element) => element.scrollIntoView({ block: 'start' }));
}

/** Height of the iPad on-screen keyboard per orientation (approx., without the shortcut bar). */
const KEYBOARD_HEIGHT = { landscape: 400, portrait: 330 };

/**
 * Chromium has no on-screen keyboard: a fake visualViewport lets the app lay out as with the
 * iPad keyboard (height via window.__setKeyboard), a grey block shows where the keyboard sits.
 */
function simulatedKeyboardScript() {
  const events = new EventTarget();
  let keyboard = 0;
  const viewport = {
    get width() {
      return window.innerWidth;
    },
    get height() {
      return window.innerHeight - keyboard;
    },
    offsetTop: 0,
    offsetLeft: 0,
    pageTop: 0,
    pageLeft: 0,
    scale: 1,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  Object.defineProperty(window, 'visualViewport', { get: () => viewport });
  Object.assign(window, {
    __setKeyboard: (height: number) => {
      keyboard = height;
      events.dispatchEvent(new Event('resize'));
      document.getElementById('e2e-keyboard')?.remove();
      if (!height) return;
      const block = document.createElement('div');
      block.id = 'e2e-keyboard';
      block.textContent = 'Bildschirmtastatur (simuliert)';
      Object.assign(block.style, {
        position: 'fixed',
        left: '0',
        right: '0',
        bottom: '0',
        height: `${height}px`,
        zIndex: '2147483647',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        font: '500 15px system-ui',
        color: '#6b7280',
        background: 'repeating-linear-gradient(0deg, #d1d5db 0 1px, #e5e7eb 1px 58px)',
        pointerEvents: 'none',
      });
      document.body.append(block);
    },
  });
}

async function setKeyboard(page: Page, on: boolean) {
  const landscape = (page.viewportSize()?.width ?? 0) > (page.viewportSize()?.height ?? 0);
  const height = on ? KEYBOARD_HEIGHT[landscape ? 'landscape' : 'portrait'] : 0;
  await page.evaluate(
    (h) => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(h),
    height,
  );
  await page.waitForTimeout(250);
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'content-type': 'application/json',
};

/** Mocked grading endpoint (no real API call): answers after `delayMs`. */
async function mockGrading(page: Page, delayMs: number) {
  await page.unroute('https://api.anthropic.com/**');
  await page.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route
      .fulfill({
        status: 200,
        headers: CORS,
        body: JSON.stringify({
          id: 'msg_screenshot',
          type: 'message',
          role: 'assistant',
          model: 'claude-haiku-4-5-20251001',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_screenshot',
              name: 'submit_grade',
              input: {
                feedback: 'Richtig – sinngemäß genau die gesuchte Bedeutung.',
                verdict: 'correct',
                confidence: 0.92,
              },
            },
          ],
          stop_reason: 'tool_use',
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
      })
      .catch(() => undefined);
  });
}

async function setAiProvider(page: Page, provider: 'Anthropic' | 'Aus') {
  await page.goto(`${PREVIEW_URL}#/settings`);
  // No restored round from the previous shot (sessionStorage survives reloads).
  await page.evaluate(() => sessionStorage.clear());
  const ai = page.getByTestId('settings-ai');
  await ai.getByRole('radio', { name: provider }).click();
  if (
    provider === 'Anthropic' &&
    (await ai.getByTestId('api-key-status').textContent()) !== 'Key hinterlegt'
  ) {
    await ai
      .getByLabel('API-Key', { exact: true })
      .fill('sk-ant-api03-screenshot-0123456789abcdef');
    await ai.getByRole('button', { name: 'Key speichern' }).click();
    await ai.getByTestId('api-key-status').filter({ hasText: 'Key hinterlegt' }).waitFor();
  }
  await page.waitForTimeout(200);
  await page.goto(`${PREVIEW_URL}#/projects`);
}

/** Opens a project and starts a round (automatic grading unless `self`). */
async function startStudy(page: Page, options: { self?: boolean; ai?: boolean } = {}) {
  await setAiProvider(page, options.ai ? 'Anthropic' : 'Aus');
  await openProject('Japanisch Grundwortschatz')(page);
  await page.getByRole('button', { name: 'Lernen', exact: true }).click();
  await page.getByTestId('study-setup').waitFor();
  await page.waitForTimeout(500);
  if (options.self) {
    await page.getByTestId('study-setup').getByRole('radio', { name: 'Selbstbewertung' }).click();
  }
  await page.getByTestId('study-start').click();
  await page.getByTestId('study-card').waitFor();
  await page.waitForTimeout(700);
}

async function studySetup(page: Page) {
  await setAiProvider(page, 'Aus');
  await openProject('Japanisch Grundwortschatz')(page);
  await page.getByRole('button', { name: 'Lernen', exact: true }).click();
  await page.getByTestId('study-setup').waitFor();
}

async function studyQuestion(page: Page) {
  await startStudy(page);
  await setKeyboard(page, true);
  await page.getByTestId('study-input').pressSequentially('Hun', { delay: 30 });
}

async function studyEvaluating(page: Page) {
  await mockGrading(page, 20_000);
  await startStudy(page, { ai: true });
  await setKeyboard(page, true);
  await page.getByTestId('study-input').fill('ein Wort für etwas anderes');
  await page.getByTestId('study-input').press('Enter');
  await page.waitForTimeout(500);
}

async function studyCorrect(page: Page) {
  await mockGrading(page, 200);
  await startStudy(page, { ai: true });
  await setKeyboard(page, true);
  await page.getByTestId('study-input').fill('ein Wort für etwas anderes');
  await page.getByTestId('study-input').press('Enter');
  await page.getByTestId('study-result').waitFor();
  await page.waitForTimeout(350);
}

async function studyWrong(page: Page) {
  await startStudy(page);
  await setKeyboard(page, true);
  await page.getByTestId('study-input').fill('keine Ahnung');
  await page.getByTestId('study-input').press('Enter');
  await page.getByTestId('study-result').waitFor();
}

async function studySelf(page: Page) {
  await startStudy(page, { self: true });
  await setKeyboard(page, true);
  await page.getByTestId('study-input').fill('vielleicht …');
  await page.getByRole('button', { name: 'Aufdecken' }).click();
  await page.waitForTimeout(400);
}

/** Same as the self assessment, without keyboard and with the card dragged to the right. */
async function studySwipe(page: Page) {
  await startStudy(page, { self: true });
  await page.getByRole('button', { name: 'Aufdecken' }).click();
  await page.waitForTimeout(900);
  const box = await page.getByTestId('study-card').last().boundingBox();
  if (!box) return;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(box.x + box.width / 2 + i * 14, y);
}

/** Mocked AI (never a real call): answers from WRONG_ANSWERS are wrong, everything else right. */
const WRONG_ANSWERS = ['Fahrrad', 'Baum', 'Morgen'];

async function mockMixedGrading(page: Page) {
  await page.unroute('https://api.anthropic.com/**');
  await page.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const body = route.request().postData() ?? '';
    const wrong = WRONG_ANSWERS.some((answer) => body.includes(answer));
    await route
      .fulfill({
        status: 200,
        headers: CORS,
        body: JSON.stringify({
          id: 'msg_screenshot',
          type: 'message',
          role: 'assistant',
          model: 'claude-haiku-4-5-20251001',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_screenshot',
              name: 'submit_grade',
              input: wrong
                ? {
                    feedback: 'Nicht ganz – gesucht war eine andere Bedeutung.',
                    verdict: 'incorrect',
                    confidence: 0.9,
                  }
                : {
                    feedback: 'Richtig – sinngemäß die gesuchte Bedeutung.',
                    verdict: 'correct',
                    confidence: 0.92,
                  },
            },
          ],
          stop_reason: 'tool_use',
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
      })
      .catch(() => undefined);
  });
}

/** Hash route of the last played round (the summary is restored from sessionStorage). */
let summaryRoute = '';

/** Plays a whole round of the Japanese demo project with the mocked AI. */
async function playRound(page: Page, isWrong: (index: number) => boolean) {
  await mockMixedGrading(page);
  await startStudy(page, { ai: true });
  const surface = page.getByTestId('study-surface');
  const input = page.getByTestId('study-input');
  for (let index = 0; ; index++) {
    await input.fill(
      isWrong(index) ? (WRONG_ANSWERS[index % WRONG_ANSWERS.length] ?? '') : 'so ungefähr',
    );
    await input.press('Enter');
    await surface.and(page.locator('[data-phase="revealed"]')).waitFor();
    await input.press('Enter');
    await page
      .locator(
        '[data-testid="study-surface"]:is([data-phase="presenting"], [data-phase="roundComplete"])',
      )
      .waitFor();
    if ((await surface.getAttribute('data-phase')) === 'roundComplete') break;
  }
  summaryRoute = new URL(page.url()).hash.slice(1);
}

async function studySummaryMixed(page: Page) {
  await playRound(page, (index) => index % 4 === 1 || index % 7 === 3);
  await page.waitForTimeout(2200); // staggered build-up and the ring counting up
}

/** Same summary after a reload, scrolled to the list of wrong answers. */
async function studySummaryList(page: Page) {
  await page.goto(`${PREVIEW_URL}#${summaryRoute}`);
  const summary = page.getByTestId('study-complete');
  await summary.waitFor();
  await page.waitForTimeout(1500);
  await page
    .getByTestId('study-list-incorrect')
    .evaluate((element) => element.scrollIntoView({ block: 'start' }));
}

/** All right: confetti mid-flight. */
async function studySummaryPerfect(page: Page) {
  await playRound(page, () => false);
  await page.waitForTimeout(150);
}

async function projectLastRound(page: Page) {
  await openProject('Japanisch Grundwortschatz')(page);
  await page.getByTestId('last-round').waitFor();
}

/** Simulated study history (developer tools), once per browser context. */
const withHistory = new WeakSet<Page>();

async function ensureHistory(page: Page) {
  if (withHistory.has(page)) return;
  await page.goto(`${PREVIEW_URL}#/dev/ui`);
  await page.getByRole('button', { name: 'Lernverlauf simulieren' }).click();
  await page.getByText(/Runden mit \d+ Antworten erzeugt/).waitFor();
  withHistory.add(page);
  // Reload: no toast in the following screenshots.
  await page.reload();
}

async function openStats(page: Page) {
  await ensureHistory(page);
  await page.goto(`${PREVIEW_URL}#/stats`);
  await page.getByTestId('stats-page').waitFor();
  await page.waitForTimeout(900);
}

async function statsDay(page: Page) {
  await openStats(page);
  await page.getByTestId('activity-heatmap').scrollIntoViewIfNeeded();
  const busiest = page.locator('[data-testid="activity-heatmap"] button[data-count]');
  const counts = await busiest.evaluateAll((cells) =>
    cells.map((cell) => Number(cell.getAttribute('data-count'))),
  );
  await busiest.nth(counts.lastIndexOf(Math.max(...counts))).click();
}

async function statsHardestRound(page: Page) {
  await setAiProvider(page, 'Aus');
  await openStats(page);
  await page.getByRole('button', { name: 'Diese Karten lernen' }).click();
  await page.getByTestId('study-setup').waitFor();
  await page.waitForTimeout(500);
  await page.getByTestId('study-start').click();
  await page.getByTestId('study-card').waitFor();
  await page.waitForTimeout(700);
}

async function projectMastery(page: Page) {
  await ensureHistory(page);
  await page.goto(`${PREVIEW_URL}#/projects`);
  await openProject('Japanisch Grundwortschatz')(page);
  await page.getByTestId('mastery-dot').nth(1).click();
}

const SHOTS: Shot[] = [
  { route: '/settings', name: 'settings', scroll: true },
  { route: '/settings', name: 'settings-ai', prepare: settingsWithKey },
  { route: '/projects', name: 'projects-empty' },
  { route: '/stats', name: 'stats-empty' },
  { route: '/dev/ui', name: 'dev-ui', prepare: enableDevModeWithDemoData },
  { route: '/dev/ui', name: 'dev-grading', prepare: gradingPlayground },
  { route: '/dev/ui', name: 'dev-session', prepare: sessionPlayground },
  { route: '/projects', name: 'projects-grid' },
  {
    route: '/projects',
    name: 'project-list',
    prepare: openProject('Aktien & Börse'),
    scroll: true,
  },
  { route: '/projects', name: 'project-grid-view', prepare: openGridView },
  { route: '/projects', name: 'card-editor', prepare: openEditorWithCounter },
  { route: '/projects', name: 'card-duplicate', prepare: openDuplicateWarning },
  { route: '/projects', name: 'project-select', prepare: selectCards },
  { route: '/projects', name: 'project-swipe', prepare: swipeRow },
  { route: '/projects', name: 'study-setup', prepare: studySetup },
  { route: '/projects', name: 'study-question', prepare: studyQuestion },
  { route: '/projects', name: 'study-evaluating', prepare: studyEvaluating },
  { route: '/projects', name: 'study-correct', prepare: studyCorrect },
  { route: '/projects', name: 'study-wrong', prepare: studyWrong },
  { route: '/projects', name: 'study-self', prepare: studySelf },
  { route: '/projects', name: 'study-swipe', prepare: studySwipe },
  { route: '/projects', name: 'study-summary-mixed', prepare: studySummaryMixed },
  { route: '/projects', name: 'study-summary-list', prepare: studySummaryList },
  { route: '/projects', name: 'study-summary-perfect', prepare: studySummaryPerfect },
  { route: '/projects', name: 'study-summary-project', prepare: projectLastRound },
  { route: '/stats', name: 'stats', prepare: openStats, scroll: true },
  { route: '/stats', name: 'stats-day', prepare: statsDay },
  { route: '/stats', name: 'stats-hardest-round', prepare: statsHardestRound },
  { route: '/projects', name: 'project-mastery', prepare: projectMastery },
];

const VARIANTS: { name: string; options: BrowserContextOptions }[] = [
  { name: 'landscape-dark', options: { ...IPAD_LANDSCAPE, colorScheme: 'dark' } },
  { name: 'landscape-light', options: { ...IPAD_LANDSCAPE, colorScheme: 'light' } },
  { name: 'portrait-dark', options: { ...IPAD_PORTRAIT, colorScheme: 'dark' } },
  { name: 'portrait-light', options: { ...IPAD_PORTRAIT, colorScheme: 'light' } },
];

/** Optional name prefix, e.g. SHOTS=study npm run screenshots. */
const ONLY = process.env.SHOTS;

const outDir = new URL('../screenshots/', import.meta.url);
mkdirSync(outDir, { recursive: true });

async function capture(page: Page, name: string) {
  const file = new URL(`${name}.png`, outDir).pathname;
  await page.screenshot({ path: file });
  console.log(`✓ ${file}`);
}

const server = await preview();
const browser = await chromium.launch();
try {
  for (const variant of VARIANTS) {
    const context = await browser.newContext({
      ...variant.options,
      // Keep screenshots free of the "offline ready" toast.
      serviceWorkers: 'block',
    });
    await context.addInitScript(simulatedKeyboardScript);
    const page = await context.newPage();
    // A filtered run still needs the demo data (normally loaded by the dev-ui shot).
    if (ONLY) await enableDevModeWithDemoData(page);
    for (const shot of SHOTS.filter((s) => !ONLY || s.name.startsWith(ONLY))) {
      await page.goto(`${PREVIEW_URL}#${shot.route}`, { waitUntil: 'networkidle' });
      // Same hash = no navigation; reload so dialogs from the previous shot are gone.
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      await shot.prepare?.(page);
      const container = page.locator('[data-scroll-container]');
      if (shot.scroll) {
        await container.evaluate((element) => {
          element.scrollTop = 0;
        });
      }
      await page.waitForTimeout(700);
      await capture(page, `${shot.name}-${variant.name}`);
      if (!shot.scroll) continue;
      for (let part = 2; part <= 8; part += 1) {
        const moved = await container.evaluate((element) => {
          const before = element.scrollTop;
          element.scrollTop += element.clientHeight - 80;
          return element.scrollTop !== before;
        });
        if (!moved) break;
        await page.waitForTimeout(300);
        await capture(page, `${shot.name}-${part}-${variant.name}`);
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
