import {
  MASTERY_LEVELS,
  type Mastery,
  type MasteryCounts,
  type MasteryLevel,
} from '@/core/mastery';
import { de } from '@/i18n/de';

const t = de.mastery;

/** Background class per mastery level (neu grau, schwach rot, im Aufbau gelb, sicher grün). */
export const MASTERY_BG: Record<MasteryLevel, string> = {
  new: 'bg-fg-muted/45',
  weak: 'bg-danger',
  building: 'bg-warning',
  solid: 'bg-success',
};

/** Order of the segments in bars and legends. */
export const MASTERY_ORDER = MASTERY_LEVELS;

export function totalOf(counts: MasteryCounts): number {
  return counts.new + counts.weak + counts.building + counts.solid;
}

/** Explanation of a card's mastery, e.g. "Im Aufbau · 62 % · 5 Antworten – Wird langsam …". */
export function masteryText(mastery: Mastery): string {
  const level = t.levels[mastery.level];
  const head =
    mastery.level === 'new'
      ? level
      : t.detail(level, Math.round(mastery.score * 100), mastery.answerCount);
  return `${head} – ${t.explanations[mastery.level]}`;
}
