import { beforeEach, describe, expect, it } from 'vitest';
import { graphPositionsRepo } from '../repositories';
import { resetDb } from './testDb';

beforeEach(resetDb);

describe('graphPositionsRepo', () => {
  it('saves, overwrites and clears positions', async () => {
    await graphPositionsRepo.saveMany([
      { nodeId: 'a', x: 1, y: 2 },
      { nodeId: 'b', x: Number.NaN, y: 0 },
    ]);
    await graphPositionsRepo.saveMany([{ nodeId: 'a', x: 3, y: 4 }]);
    const list = await graphPositionsRepo.list();
    expect(list.map(({ nodeId, x, y }) => ({ nodeId, x, y }))).toEqual([
      { nodeId: 'a', x: 3, y: 4 },
    ]);
    expect(list[0]?.updatedAt).toMatch(/Z$/);
    await graphPositionsRepo.clear();
    expect(await graphPositionsRepo.list()).toEqual([]);
  });
});
