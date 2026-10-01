import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateSynapseFile, type SynapseFile } from '@/core/backup/format';
import { db } from '../db';
import {
  answersRepo,
  backupRepo,
  cardsRepo,
  LAST_EXPORTED_KEY,
  LINK_STATE_KEY,
  linkExplanationsRepo,
  linksRepo,
  projectsRepo,
  secretsRepo,
  sessionsRepo,
  settingsRepo,
  snapshotsRepo,
} from '../repositories';
import { CROSS_PROJECT_ID } from '../types';
import { resetDb } from './testDb';

beforeEach(resetDb);
afterEach(() => vi.useRealTimers());

const API_KEY = 'sk-ant-api03-supersecret-test-key';
const HASH = 'a'.repeat(64);

async function seed() {
  const japanese = await projectsRepo.create({
    name: 'Japanisch',
    color: 'rose',
    icon: 'languages',
  });
  const economics = await projectsRepo.create({ name: 'VWL', description: 'Makro', color: 'sky' });
  await projectsRepo.update(economics.id, { archived: true });
  const [dog, cat] = await cardsRepo.bulkCreate(japanese.id, [
    { front: '犬', back: 'Hund', tags: ['N5', 'Tiere'] },
    { front: '猫', back: 'Katze', notes: 'ねこ' },
  ]);
  const [gdp] = await cardsRepo.bulkCreate(economics.id, [
    { front: 'BIP', back: 'Bruttoinlandsprodukt' },
  ]);
  const session = await sessionsRepo.create({
    projectId: japanese.id,
    roundNumber: 1,
    mode: 'all',
    direction: 'front_to_back',
    gradingMode: 'ai',
    totalCards: 2,
  });
  await answersRepo.create({
    sessionId: session.id,
    cardId: dog!.id,
    directionUsed: 'front_to_back',
    userInput: 'Hund',
    verdict: 'correct',
    method: 'ai',
    confidence: 0.9,
    feedback: 'Gut',
    responseTimeMs: 1200,
  });
  await sessionsRepo.finish(session.id, { correctCount: 1, incorrectCount: 0 });
  const cross = await sessionsRepo.create({
    projectId: CROSS_PROJECT_ID,
    roundNumber: 1,
    mode: 'all',
    direction: 'mixed',
    gradingMode: 'self',
    totalCards: 2,
  });
  for (const cardId of [cat!.id, gdp!.id]) {
    await answersRepo.create({
      sessionId: cross.id,
      cardId,
      directionUsed: 'back_to_front',
      userInput: '?',
      verdict: 'incorrect',
      method: 'self',
    });
  }
  const now = new Date().toISOString();
  await db.gradingCache.put({
    cardId: dog!.id,
    direction: 'front_to_back',
    inputHash: HASH,
    strictness: 'meaning',
    verdict: 'correct',
    model: 'claude-haiku-4-5-20251001',
    createdAt: now,
  });
  await linksRepo.addManual(dog!.id, gdp!.id);
  await db.cardLinks.add({
    id: crypto.randomUUID(),
    sourceCardId: dog!.id < cat!.id ? dog!.id : cat!.id,
    targetCardId: dog!.id < cat!.id ? cat!.id : dog!.id,
    kind: 'semantic',
    weight: 0.8,
    createdAt: now,
  });
  await linkExplanationsRepo.save(dog!, gdp!, 'Beide …', 'test-model');
  await db.graphPositions.bulkPut([
    { nodeId: dog!.id, x: 1, y: 2, updatedAt: now },
    { nodeId: japanese.id, x: 0, y: 0, updatedAt: now },
  ]);
  await db.cardEmbeddings.put({
    cardId: dog!.id,
    model: 'm',
    textHash: 'h',
    vector: new Float32Array([1, 0]),
    dim: 2,
    createdAt: now,
  });
  await settingsRepo.set('theme', 'dark');
  await settingsRepo.set(LINK_STATE_KEY, { model: 'm' });
  await settingsRepo.set(LAST_EXPORTED_KEY, now);
  await secretsRepo.set('anthropicApiKey', API_KEY);
  return { japanese, economics, dog: dog!, cat: cat!, gdp: gdp!, session, cross };
}

/** Everything a backup restores, in a stable order. */
async function dump() {
  const byId = <T extends { id: string }>(rows: T[]) =>
    [...rows].sort((a, b) => a.id.localeCompare(b.id));
  return {
    projects: byId(await db.projects.toArray()),
    cards: byId(await db.cards.toArray()),
    studySessions: byId(await db.studySessions.toArray()),
    answers: byId(await db.answers.toArray()),
    manualLinks: byId((await db.cardLinks.toArray()).filter((l) => l.kind === 'manual')),
    gradingCache: await db.gradingCache.toArray(),
    graphPositions: await db.graphPositions.orderBy('nodeId').toArray(),
    linkExplanations: await db.linkExplanations.toArray(),
  };
}

/** Like a file written to disk and read back. */
function roundTrip(file: SynapseFile): SynapseFile {
  const result = validateSynapseFile(JSON.parse(JSON.stringify(file)));
  if (!result.ok) throw new Error(`invalid: ${result.code} ${result.path}`);
  return result.file;
}

describe('backupRepo', () => {
  it('export → import into an empty database gives identical data', async () => {
    await seed();
    const before = await dump();
    const file = roundTrip(await backupRepo.collectExport('all', { includeHistory: true }));
    expect(file.settings).toEqual([]);
    expect(file.gradingCache).toEqual([]);

    await resetDb();
    const result = await backupRepo.importFile(file, { includeHistory: true });
    expect(result).toMatchObject({ projectsAdded: 2, cardsAdded: 3, answersAdded: 3 });
    const after = await dump();
    expect(after.projects).toEqual(before.projects);
    expect(after.cards).toEqual(before.cards);
    expect(after.studySessions).toEqual(before.studySessions);
    expect(after.answers).toEqual(before.answers);
    expect(after.manualLinks).toEqual(before.manualLinks);
  });

  it('backup → restore gives identical data and keeps secrets and backup settings', async () => {
    const { dog, cat } = await seed();
    const before = await dump();
    const file = roundTrip(await backupRepo.collectBackup());
    expect(file.settings.map((s) => s.key)).toEqual(['theme']);

    // Changes after the backup are undone by the restore.
    await cardsRepo.delete(cat.id);
    await projectsRepo.create({ name: 'Neu' });
    await settingsRepo.set('theme', 'light');
    await backupRepo.restore(file);

    expect(await dump()).toEqual(before);
    expect(await settingsRepo.get('theme', 'system')).toBe('dark');
    expect(await settingsRepo.get(LINK_STATE_KEY, null)).toBeNull();
    expect(await settingsRepo.get(LAST_EXPORTED_KEY, null)).not.toBeNull();
    expect(await secretsRepo.has('anthropicApiKey')).toBe(true);
    // Embeddings of existing cards stay, semantic links are recomputed later.
    expect(await db.cardEmbeddings.get(dog.id)).toBeDefined();
    expect(await db.cardLinks.where('kind').equals('semantic').count()).toBe(0);
  });

  it('never writes the API key into exports, backups or snapshots', async () => {
    await seed();
    const texts = [
      JSON.stringify(await backupRepo.collectBackup()),
      JSON.stringify(await backupRepo.collectExport('all', { includeHistory: true })),
      (await snapshotsRepo.create('manual')).json,
    ];
    for (const text of texts) {
      expect(text).not.toContain(API_KEY);
      expect(text).not.toContain('anthropicApiKey');
      expect(text).not.toContain('secrets');
      expect(text).not.toContain('vector');
    }
  });

  it('exports one project with its own rounds and its answers from cross-project rounds', async () => {
    const { japanese, dog, cat, gdp, session, cross } = await seed();
    const file = roundTrip(
      await backupRepo.collectExport({ projectId: japanese.id }, { includeHistory: true }),
    );
    expect(file.projects.map((p) => p.name)).toEqual(['Japanisch']);
    expect(file.cards.map((c) => c.id).sort()).toEqual([dog.id, cat.id].sort());
    expect(file.studySessions.map((s) => s.id).sort()).toEqual([session.id, cross.id].sort());
    expect(file.answers.map((a) => a.cardId).sort()).toEqual([dog.id, cat.id].sort());
    expect(file.answers.some((a) => a.cardId === gdp.id)).toBe(false);
    // The manual link points to a card of another project.
    expect(file.cardLinks).toEqual([]);

    const plain = await backupRepo.collectExport(
      { projectId: japanese.id },
      { includeHistory: false },
    );
    expect(plain.studySessions).toEqual([]);
    expect(plain.answers).toEqual([]);
  });

  it('imports a file again: merge adds nothing, "new" adds a renamed copy', async () => {
    const { japanese } = await seed();
    const file = roundTrip(
      await backupRepo.collectExport({ projectId: japanese.id }, { includeHistory: true }),
    );
    expect(await backupRepo.findConflicts(file)).toEqual(new Map([[japanese.id, 'Japanisch']]));

    const merged = await backupRepo.importFile(file, { includeHistory: true });
    expect(merged).toMatchObject({
      projectsAdded: 0,
      cardsAdded: 0,
      duplicatesSkipped: 2,
      answersAdded: 0,
    });

    const copied = await backupRepo.importFile(file, {
      strategies: { [japanese.id]: 'new' },
      includeHistory: true,
    });
    expect(copied).toMatchObject({ projectsAdded: 1, cardsAdded: 2 });
    const projects = await projectsRepo.list();
    const copy = projects.find((p) => p.name === 'Japanisch (2)');
    expect(copy?.cardCount).toBe(2);
    // History of the copy: its own round is new, the rounds already present are not repeated.
    expect(copied.answersAdded).toBe(0);

    const skipped = await backupRepo.importFile(file, {
      strategies: { [japanese.id]: 'skip' },
      includeHistory: true,
    });
    expect(skipped).toMatchObject({ projectsAdded: 0, cardsAdded: 0 });
  });

  it('reports the inputs of the backup reminder', async () => {
    expect(await backupRepo.status()).toEqual({});
    await seed();
    const status = await backupRepo.status();
    expect(status.lastExportedAt).toBeDefined();
    expect(status.firstCardAt).toBeDefined();
  });
});

describe('snapshotsRepo', () => {
  it('keeps the newest seven snapshots', async () => {
    await seed();
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = Date.parse('2026-10-01T08:00:00Z');
    const created: string[] = [];
    for (let i = 0; i < 9; i++) {
      vi.setSystemTime(start + i * 86_400_000);
      created.push((await snapshotsRepo.create(i === 8 ? 'manual' : 'auto')).id);
    }
    const list = await snapshotsRepo.list();
    expect(list).toHaveLength(7);
    expect(list.map((s) => s.id)).toEqual(created.slice(2).reverse());
    expect(list[0]).toMatchObject({
      reason: 'manual',
      projectCount: 2,
      cardCount: 3,
      answerCount: 3,
    });
    expect(list[0]!.size).toBeGreaterThan(100);
    expect(await snapshotsRepo.latestCreatedAt()).toBe(
      new Date(start + 8 * 86_400_000).toISOString(),
    );

    const snapshot = await snapshotsRepo.get(created[8]!);
    expect(validateSynapseFile(JSON.parse(snapshot!.json))).toMatchObject({ ok: true });
  });
});

describe('cardsRepo.importMany without duplicate check', () => {
  it('adds cards with an existing front side when asked to', async () => {
    const project = await projectsRepo.create({ name: 'P' });
    await cardsRepo.create(project.id, { front: 'A', back: '1' });
    const result = await cardsRepo.importMany(project.id, [{ front: 'a', back: '2' }], {
      skipDuplicates: false,
    });
    expect(result).toMatchObject({ skippedDuplicates: 0 });
    expect(await cardsRepo.countByProject(project.id)).toBe(2);
  });
});
