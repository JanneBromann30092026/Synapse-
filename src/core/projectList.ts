/** Pure helpers for the project grid (filtering and drag & drop ordering). */

export interface FilterableProject {
  id: string;
  name: string;
  archived: boolean;
}

export interface ProjectFilter {
  query: string;
  showArchived: boolean;
}

function normalize(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase('de-DE').trim();
}

/** Keeps the input order; matches every whitespace-separated term against the name. */
export function filterProjects<T extends FilterableProject>(
  projects: T[],
  filter: ProjectFilter,
): T[] {
  const terms = normalize(filter.query).split(/\s+/).filter(Boolean);
  return projects.filter((project) => {
    if (project.archived && !filter.showArchived) return false;
    const name = normalize(project.name);
    return terms.every((term) => name.includes(term));
  });
}

/** Moves one element; returns a new array (indexes out of range return a copy). */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

/**
 * Applies a new order of the visible (filtered) projects to the full list: hidden projects
 * keep their slots, the visible slots are filled in the new visible order.
 */
export function mergeVisibleOrder(
  fullOrder: readonly string[],
  newVisibleOrder: readonly string[],
): string[] {
  const visible = new Set(newVisibleOrder);
  const queue = [...newVisibleOrder];
  return fullOrder.map((id) => (visible.has(id) ? (queue.shift() ?? id) : id));
}
