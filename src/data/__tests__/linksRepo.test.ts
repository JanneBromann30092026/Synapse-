import { beforeEach, describe, expect, it } from 'vitest';
import {
  brainRepo,
  cardsRepo,
  linkExplanationsRepo,
  linksRepo,
  projectsRepo,
  sessionsRepo,
  answersRepo,
} from '../repositories';
import { db } from '../db';
import { ValidationError } from '../errors';
import { resetDb } from './testDb';

beforeEach(resetDb);

async function seed() {
  const a = await projectsRepo.create({ name: 'Japanisch' });
  const b = await projectsRepo.create({ name: 'BWL' });
  const [hund, katze] = await cardsRepo.bulkCreate(a.id, [
    { front: 'Hund', back: 'いぬ' },
    { front: 'Katze', back: 'ねこ' },
  ]);
  const [cash] = await cardsRepo.bulkCreate(b.id, [{ front: 'Cashflow', back: 'Zufluss' }]);
  return { a, b, hund: hund!, katze: katze!, cash: cash! };
}

describe('manual links', () => {
  it('adds once (normalized pair) and removes again', async () => {
    const { hund, cash } = await seed();
    const first = await linksRepo.addManual(cash.id, hund.id);
    const second = await linksRepo.addManual(hund.id, cash.id);
    expect(second.id).toBe(first.id);
    expect(first.sourceCardId < first.targetCardId).toBe(true);
    expect(first).toMatchObject({ kind: 'manual', weight: 1 });
    expect(await db.cardLinks.count()).toBe(1);
    await linksRepo.removeManual(first.id);
    expect(await db.cardLinks.count()).toBe(0);
  });

  it('rejects self links and never removes semantic links', async () => {
    const { hund, katze } = await seed();
    await expect(linksRepo.addManual(hund.id, hund.id)).rejects.toBeInstanceOf(ValidationError);
    await db.cardLinks.add({
      id: 'sem',
      sourceCardId: hund.id < katze.id ? hund.id : katze.id,
      targetCardId: hund.id < katze.id ? katze.id : hund.id,
      kind: 'semantic',
      weight: 0.7,
      createdAt: new Date().toISOString(),
    });
    await expect(linksRepo.removeManual('sem')).rejects.toBeInstanceOf(ValidationError);
    expect(await db.cardLinks.count()).toBe(1);
  });
});

describe('link explanations', () => {
  it('caches per pair and invalidates when a card text changes', async () => {
    const { hund, cash } = await seed();
    await linkExplanationsRepo.save(cash, hund, 'Erklärung.', 'claude-haiku-4-5-20251001');
    expect((await linkExplanationsRepo.get(hund, cash))?.explanation).toBe('Erklärung.');
    const edited = await cardsRepo.update(hund.id, { back: 'Hund (Tier)' });
    expect(await linkExplanationsRepo.get(edited, cash)).toBeUndefined();
  });

  it('are deleted with their cards', async () => {
    const { hund, cash, b } = await seed();
    await linkExplanationsRepo.save(hund, cash, 'x', 'm');
    await projectsRepo.delete(b.id);
    expect(await db.linkExplanations.count()).toBe(0);
  });
});

describe('brainRepo.getCardDetail', () => {
  it('returns the card, history and linked cards by similarity', async () => {
    const { hund, katze, cash } = await seed();
    await db.cardLinks.add({
      id: 'sem',
      sourceCardId: hund.id < katze.id ? hund.id : katze.id,
      targetCardId: hund.id < katze.id ? katze.id : hund.id,
      kind: 'semantic',
      weight: 0.7,
      createdAt: new Date().toISOString(),
    });
    await linksRepo.addManual(hund.id, cash.id);
    const session = await sessionsRepo.create({
      projectId: hund.projectId,
      roundNumber: 1,
      mode: 'all',
      direction: 'front_to_back',
      gradingMode: 'self',
      totalCards: 1,
    });
    for (const verdict of ['incorrect', 'correct'] as const) {
      await answersRepo.create({
        sessionId: session.id,
        cardId: hund.id,
        directionUsed: 'front_to_back',
        userInput: 'x',
        verdict,
        method: 'self',
      });
    }
    const detail = await brainRepo.getCardDetail(hund.id);
    expect(detail?.card.front).toBe('Hund');
    expect(detail?.recent.map((r) => r.verdict)).toEqual(['correct', 'incorrect']);
    expect(detail?.mastery.answerCount).toBe(2);
    expect(detail?.links.map((l) => [l.card.front, l.kind, l.crossProject])).toEqual([
      ['Cashflow', 'manual', true],
      ['Katze', 'semantic', false],
    ]);
    expect(await brainRepo.getCardDetail('missing')).toBeUndefined();
  });
});
