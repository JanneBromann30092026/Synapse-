/**
 * Level of detail for card labels in the brain: which nodes get a label at the current zoom.
 * All coordinates here are screen pixels.
 */

/** Card labels appear from this zoom factor on. */
export const LABEL_MIN_ZOOM = 1.4;
/** Above this many visible cards only the better connected half is labeled. */
export const LABEL_DENSE_COUNT = 140;
/** Upper bound of card labels per frame. */
export const LABEL_MAX = 90;
/** Maximum characters of a card label (front side). */
export const LABEL_MAX_CHARS = 28;

export interface LabelCandidate {
  id: string;
  /** Node center and radius on screen. */
  x: number;
  y: number;
  radius: number;
  /** Label size (pill) on screen. */
  width: number;
  height: number;
  /** Higher = labeled first (e.g. number of links). */
  priority: number;
}

export interface LabelBox {
  id: string;
  /** Top-left corner of the pill. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Shortens a front side to one line with an ellipsis. */
export function truncateLabel(text: string, max = LABEL_MAX_CHARS): string {
  const line = text.replace(/\s+/g, ' ').trim();
  const chars = Array.from(line);
  return chars.length <= max
    ? line
    : `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`;
}

/** Minimum priority a visible card needs: everything when sparse, the upper half when dense. */
export function priorityCutoff(priorities: readonly number[]): number {
  if (priorities.length <= LABEL_DENSE_COUNT) return -Infinity;
  const sorted = [...priorities].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? -Infinity;
}

function overlaps(a: LabelBox, b: LabelBox, gap: number): boolean {
  return (
    a.x < b.x + b.width + gap &&
    b.x < a.x + a.width + gap &&
    a.y < b.y + b.height + gap &&
    b.y < a.y + a.height + gap
  );
}

/**
 * Picks labels greedily by priority: each pill sits centered below its node and must not
 * overlap an already placed one. A coarse grid keeps the overlap checks cheap.
 */
export function placeLabels(
  candidates: readonly LabelCandidate[],
  options: {
    zoom: number;
    max?: number;
    gap?: number;
    cell?: number;
    /** Boxes that are already taken (e.g. hub names). */
    reserved?: readonly LabelBox[];
  },
): LabelBox[] {
  if (options.zoom < LABEL_MIN_ZOOM || candidates.length === 0) return [];
  const max = options.max ?? LABEL_MAX;
  const gap = options.gap ?? 4;
  const cell = options.cell ?? 120;
  const cutoff = priorityCutoff(candidates.map((candidate) => candidate.priority));
  const sorted = candidates
    .filter((candidate) => candidate.priority >= cutoff)
    .sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1));

  const grid = new Map<string, LabelBox[]>();
  const cellsOf = (box: LabelBox): string[] => {
    const keys: string[] = [];
    for (
      let cx = Math.floor((box.x - gap) / cell);
      cx <= Math.floor((box.x + box.width + gap) / cell);
      cx++
    ) {
      for (
        let cy = Math.floor((box.y - gap) / cell);
        cy <= Math.floor((box.y + box.height + gap) / cell);
        cy++
      ) {
        keys.push(`${cx}:${cy}`);
      }
    }
    return keys;
  };

  const register = (box: LabelBox) => {
    for (const key of cellsOf(box)) {
      const list = grid.get(key);
      if (list) list.push(box);
      else grid.set(key, [box]);
    }
  };
  for (const box of options.reserved ?? []) register(box);

  const placed: LabelBox[] = [];
  for (const candidate of sorted) {
    if (placed.length >= max) break;
    const box: LabelBox = {
      id: candidate.id,
      x: candidate.x - candidate.width / 2,
      y: candidate.y + candidate.radius + 4,
      width: candidate.width,
      height: candidate.height,
    };
    const keys = cellsOf(box);
    const blocked = keys.some((key) => grid.get(key)?.some((other) => overlaps(box, other, gap)));
    if (blocked) continue;
    placed.push(box);
    register(box);
  }
  return placed;
}
