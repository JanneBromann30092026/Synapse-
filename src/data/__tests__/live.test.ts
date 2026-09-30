import { liveQuery } from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { projectsRepo } from '../repositories';
import { resetDb } from './testDb';

beforeEach(resetDb);

describe('reactivity', () => {
  it('re-emits repository results when the data changes', async () => {
    const values: number[] = [];
    const subscription = liveQuery(() => projectsRepo.count()).subscribe((value) => {
      values.push(value);
    });
    await expect.poll(() => values).toEqual([0]);
    await projectsRepo.create({ name: 'A' });
    await expect.poll(() => values).toEqual([0, 1]);
    subscription.unsubscribe();
  });
});
