import { describe, expect, it } from 'vitest';
import { filterProjects, mergeVisibleOrder, moveItem } from './projectList';

const projects = [
  { id: 'a', name: 'Japanisch', archived: false },
  { id: 'b', name: 'BWL-Begriffe', archived: true },
  { id: 'c', name: 'Japanische Kanji', archived: false },
  { id: 'd', name: 'Biologie', archived: false },
];

describe('filterProjects', () => {
  it('hides archived projects unless requested', () => {
    expect(filterProjects(projects, { query: '', showArchived: false }).map((p) => p.id)).toEqual([
      'a',
      'c',
      'd',
    ]);
    expect(filterProjects(projects, { query: '', showArchived: true }).map((p) => p.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('searches names case-insensitively with all terms', () => {
    const ids = (query: string) =>
      filterProjects(projects, { query, showArchived: true }).map((p) => p.id);
    expect(ids('japan')).toEqual(['a', 'c']);
    expect(ids('  KANJI japan ')).toEqual(['c']);
    expect(ids('bwl')).toEqual(['b']);
    expect(ids('xyz')).toEqual([]);
  });
});

describe('moveItem', () => {
  it('moves forward and backward', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('returns an unchanged copy for invalid indexes', () => {
    const items = ['a', 'b'];
    const moved = moveItem(items, 0, 5);
    expect(moved).toEqual(items);
    expect(moved).not.toBe(items);
  });
});

describe('mergeVisibleOrder', () => {
  it('keeps hidden projects in their slots', () => {
    // b is hidden (archived); the user drags d before a.
    expect(mergeVisibleOrder(['a', 'b', 'c', 'd'], ['d', 'a', 'c'])).toEqual(['d', 'b', 'a', 'c']);
  });

  it('equals the new order when everything is visible', () => {
    expect(mergeVisibleOrder(['a', 'b', 'c'], ['c', 'b', 'a'])).toEqual(['c', 'b', 'a']);
  });
});
