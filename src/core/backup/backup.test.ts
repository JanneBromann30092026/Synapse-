import { describe, expect, it } from 'vitest';
import { analyzeImport } from '@/core/importAnalysis';
import {
  FORMAT_VERSION,
  parseSynapseFile,
  summarizeFile,
  validateSynapseFile,
  type SynapseFile,
  type SynapseFileInput,
} from './format';
import { findConflicts, planImport, uniqueName, type ExistingState } from './plan';
import {
  backupFileName,
  exportFileName,
  isBackupReminderDue,
  isSnapshotDue,
  slugify,
  snapshotsToDelete,
} from './schedule';

const T = '2026-10-01T10:00:00.000Z';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const P1 = id(1);
const P2 = id(2);
const C1 = id(11);
const C2 = id(12);
const C3 = id(13);
const S1 = id(21);
const S2 = id(22);
const A1 = id(31);
const A2 = id(32);
const L1 = id(41);

function sample(): SynapseFileInput {
  return {
    format: 'synapse',
    version: FORMAT_VERSION,
    kind: 'export',
    exportedAt: T,
    projects: [
      {
        id: P1,
        name: 'Japanisch',
        color: 'rose',
        includeInBrain: true,
        sortOrder: 0,
        archived: false,
        createdAt: T,
        updatedAt: T,
      },
      {
        id: P2,
        name: 'VWL',
        color: 'sky',
        includeInBrain: true,
        sortOrder: 3,
        archived: false,
        createdAt: T,
        updatedAt: T,
      },
    ],
    cards: [
      {
        id: C1,
        projectId: P1,
        front: '犬',
        back: 'Hund',
        tags: ['N5'],
        createdAt: T,
        updatedAt: T,
      },
      {
        id: C2,
        projectId: P1,
        front: '猫',
        back: 'Katze',
        notes: 'ねこ',
        tags: [],
        createdAt: T,
        updatedAt: T,
      },
      {
        id: C3,
        projectId: P2,
        front: 'BIP',
        back: 'Bruttoinlandsprodukt',
        tags: [],
        createdAt: T,
        updatedAt: T,
      },
    ],
    studySessions: [
      {
        id: S1,
        projectId: P1,
        roundNumber: 1,
        mode: 'all',
        direction: 'front_to_back',
        gradingMode: 'self',
        startedAt: T,
        finishedAt: T,
        aborted: false,
        totalCards: 2,
        correctCount: 1,
        incorrectCount: 1,
      },
      {
        id: S2,
        projectId: 'cross',
        roundNumber: 1,
        mode: 'all',
        direction: 'mixed',
        gradingMode: 'ai',
        startedAt: T,
        aborted: true,
        totalCards: 1,
        correctCount: 0,
        incorrectCount: 0,
      },
    ],
    answers: [
      {
        id: A1,
        sessionId: S1,
        cardId: C1,
        directionUsed: 'front_to_back',
        userInput: 'Hund',
        verdict: 'correct',
        method: 'exact',
        answeredAt: T,
      },
      {
        id: A2,
        sessionId: S2,
        cardId: C3,
        directionUsed: 'back_to_front',
        userInput: '?',
        verdict: 'incorrect',
        method: 'self',
        answeredAt: T,
      },
    ],
    cardLinks: [
      { id: L1, sourceCardId: C1, targetCardId: C3, kind: 'manual', weight: 1, createdAt: T },
    ],
  };
}

function parsed(input: SynapseFileInput = sample()): SynapseFile {
  const result = validateSynapseFile(input);
  if (!result.ok) throw new Error(`invalid sample: ${result.code} ${result.path}`);
  return result.file;
}

const empty: ExistingState = {
  projects: [],
  cards: [],
  usedIds: new Set(),
  manualLinkPairs: new Set(),
};

let counter = 1000;
const newId = () => id(counter++);

describe('Synapse file format', () => {
  it('accepts a valid file and fills missing optional lists', () => {
    const file = parsed();
    expect(file.gradingCache).toEqual([]);
    expect(file.settings).toEqual([]);
    expect(summarizeFile(file)).toMatchObject({
      cardCount: 3,
      answerCount: 2,
      projects: [
        { id: P1, name: 'Japanisch', cardCount: 2 },
        { id: P2, name: 'VWL', cardCount: 1 },
      ],
    });
  });

  it('rejects non-JSON, foreign JSON and newer versions', () => {
    expect(parseSynapseFile('{nope')).toEqual({ ok: false, code: 'notJson' });
    expect(parseSynapseFile('{"cards": []}')).toEqual({ ok: false, code: 'notSynapse' });
    expect(validateSynapseFile({ ...sample(), version: FORMAT_VERSION + 1 })).toEqual({
      ok: false,
      code: 'newerVersion',
    });
    expect(parseSynapseFile(`\uFEFF${JSON.stringify(sample())}`).ok).toBe(true);
  });

  it('reports the path of invalid fields and broken references', () => {
    const blank = sample();
    blank.cards[1] = { ...blank.cards[1]!, back: '  ' };
    expect(validateSynapseFile(blank)).toMatchObject({ ok: false, path: 'cards.1.back' });

    const orphan = sample();
    orphan.answers = [{ ...orphan.answers![0]!, cardId: id(99) }];
    expect(validateSynapseFile(orphan)).toMatchObject({ ok: false, path: 'answers.0.cardId' });

    const twice = sample();
    twice.cards.push({ ...twice.cards[0]! });
    expect(validateSynapseFile(twice)).toMatchObject({ ok: false, code: 'invalid', path: 'cards' });
  });

  it('is recognized by the import analysis (JSON vs. CSV)', () => {
    const json = analyzeImport({ text: JSON.stringify(sample()) });
    expect(json.kind).toBe('synapse');
    const csv = analyzeImport({ bytes: new TextEncoder().encode('front;back\nA;B') });
    expect(csv).toMatchObject({ kind: 'table', encoding: 'utf-8' });
    expect(analyzeImport({ text: '  \n' })).toEqual({ kind: 'error', code: 'empty' });
  });
});

describe('planImport', () => {
  it('keeps ids, order and history when importing into an empty database', () => {
    const file = parsed();
    const plan = planImport(file, empty, { includeHistory: true, newId });
    expect(plan.projects).toEqual(file.projects);
    expect(plan.cards).toEqual(file.cards);
    expect(plan.studySessions).toEqual(file.studySessions);
    expect(plan.answers).toEqual(file.answers);
    expect(plan.cardLinks).toEqual(file.cardLinks);
    expect(plan.outcomes.map((o) => o.action)).toEqual(['created', 'created']);
  });

  it('gives new ids where ids already exist and keeps references consistent', () => {
    const file = parsed();
    const plan = planImport(
      file,
      { ...empty, usedIds: new Set([C1, S1]) },
      { includeHistory: true, newId },
    );
    const dog = plan.cards.find((c) => c.front === '犬')!;
    expect(dog.id).not.toBe(C1);
    // S1 exists: that round (and its answer) was imported before and is not added again.
    expect(plan.studySessions.map((s) => s.id)).toEqual([S2]);
    expect(plan.answers.map((a) => a.id)).toEqual([A2]);
    const link = plan.cardLinks[0]!;
    expect([link.sourceCardId, link.targetCardId].sort()).toEqual([dog.id, C3].sort());
    expect(link.sourceCardId < link.targetCardId).toBe(true);
  });

  it('merges into a project with the same name, skipping duplicate fronts', () => {
    const file = parsed();
    const existing: ExistingState = {
      projects: [{ id: id(500), name: 'japanisch', sortOrder: 0 }],
      cards: [{ id: id(501), projectId: id(500), front: ' 犬 ' }],
      usedIds: new Set([id(500), id(501)]),
      manualLinkPairs: new Set(),
    };
    expect(findConflicts(file, existing)).toEqual(new Map([[P1, id(500)]]));
    const plan = planImport(file, existing, { includeHistory: true, newId });
    expect(plan.projects.map((p) => p.name)).toEqual(['VWL']);
    // VWL is appended after the existing projects.
    expect(plan.projects[0]!.sortOrder).toBe(1);
    expect(plan.cards.map((c) => [c.front, c.projectId])).toEqual([
      ['猫', id(500)],
      ['BIP', plan.projects[0]!.id],
    ]);
    expect(plan.outcomes[0]).toMatchObject({
      action: 'merged',
      targetName: 'japanisch',
      cardsAdded: 1,
      duplicatesSkipped: 1,
    });
    // The answer to the duplicate now belongs to the existing card.
    expect(plan.answers.find((a) => a.id === A1)?.cardId).toBe(id(501));
    expect(plan.studySessions.find((s) => s.id === S1)?.projectId).toBe(id(500));
  });

  it('creates a renamed copy or skips the project on request', () => {
    const file = parsed();
    const existing: ExistingState = {
      projects: [
        { id: id(500), name: 'Japanisch', sortOrder: 0 },
        { id: id(502), name: 'Japanisch (2)', sortOrder: 1 },
      ],
      cards: [],
      usedIds: new Set([id(500), id(502)]),
      manualLinkPairs: new Set(),
    };
    const copy = planImport(file, existing, {
      strategies: { [P1]: 'new' },
      includeHistory: false,
      newId,
    });
    expect(copy.projects.map((p) => p.name)).toEqual(['Japanisch (3)', 'VWL']);
    expect(copy.cards).toHaveLength(3);
    expect(copy.studySessions).toEqual([]);

    const skipped = planImport(file, existing, {
      strategies: { [P1]: 'skip' },
      includeHistory: true,
      newId,
    });
    expect(skipped.projects.map((p) => p.name)).toEqual(['VWL']);
    expect(skipped.cards.map((c) => c.front)).toEqual(['BIP']);
    expect(skipped.studySessions.map((s) => s.id)).toEqual([S2]);
    // The manual link pointed to a skipped card.
    expect(skipped.cardLinks).toEqual([]);
    expect(skipped.outcomes[0]).toMatchObject({ action: 'skipped' });
  });

  it('does not add a manual link twice', () => {
    const file = parsed();
    const plan = planImport(
      file,
      { ...empty, manualLinkPairs: new Set([`${C1}|${C3}`]) },
      { includeHistory: false, newId },
    );
    expect(plan.cardLinks).toEqual([]);
  });

  it('numbers names without exceeding the length limit', () => {
    expect(uniqueName('A', new Set(['a (2)']))).toBe('A (3)');
    expect(uniqueName('x'.repeat(80), new Set())).toHaveLength(80);
  });
});

describe('snapshot and reminder rules', () => {
  const tz = 'Europe/Berlin';

  it('allows one automatic snapshot per local day', () => {
    expect(isSnapshotDue(undefined, new Date(T), tz)).toBe(true);
    expect(isSnapshotDue('2026-10-01T06:00:00Z', new Date('2026-10-01T21:59:00Z'), tz)).toBe(false);
    // 22:00 UTC is already the next day in Berlin.
    expect(isSnapshotDue('2026-10-01T06:00:00Z', new Date('2026-10-01T22:00:00Z'), tz)).toBe(true);
  });

  it('keeps the newest seven snapshots', () => {
    const snapshots = Array.from({ length: 9 }, (_, i) => ({
      id: `s${i}`,
      createdAt: `2026-10-0${i + 1}T00:00:00Z`,
    }));
    expect(snapshotsToDelete(snapshots.reverse())).toEqual(['s1', 's0']);
    expect(snapshotsToDelete(snapshots.slice(0, 7))).toEqual([]);
  });

  it('reminds after seven days without an exported backup', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    const base = { hasData: true, now, firstDataAt: '2026-09-01T00:00:00Z' };
    expect(isBackupReminderDue({ ...base, lastExportedAt: '2026-10-04T12:00:00Z' })).toBe(false);
    expect(isBackupReminderDue({ ...base, lastExportedAt: '2026-10-03T12:00:00Z' })).toBe(true);
    expect(isBackupReminderDue(base)).toBe(true);
    expect(isBackupReminderDue({ ...base, firstDataAt: '2026-10-09T00:00:00Z' })).toBe(false);
    expect(isBackupReminderDue({ ...base, hasData: false })).toBe(false);
    expect(isBackupReminderDue({ ...base, snoozedUntil: '2026-10-11T00:00:00Z' })).toBe(false);
  });

  it('builds file names', () => {
    const now = new Date('2026-10-01T23:30:00Z');
    expect(backupFileName(now, tz)).toBe('synapse-backup-2026-10-02.json');
    expect(exportFileName('Japanisch N5 – Verben', 'csv', now, tz)).toBe(
      'synapse-japanisch-n5-verben-2026-10-02.csv',
    );
    expect(exportFileName(null, 'json', now, tz)).toBe('synapse-export-2026-10-02.json');
    expect(slugify('Größe & Übung')).toBe('groesse-uebung');
    expect(slugify('日本語')).toBe('日本語');
    expect(slugify('!!!')).toBe('projekt');
  });
});
