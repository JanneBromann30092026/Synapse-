/** Rules for automatic snapshots, the backup reminder and file names. */
import { dayKey } from '@/core/activity';

/** Automatic snapshots kept in the app (older ones are deleted). */
export const SNAPSHOT_KEEP = 7;
/** Days after the last exported backup until the reminder appears. */
export const BACKUP_REMINDER_DAYS = 7;
/** "Später" hides the reminder for this many days. */
export const BACKUP_SNOOZE_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** At most one automatic snapshot per (local) calendar day. */
export function isSnapshotDue(
  lastSnapshotAt: string | undefined,
  now: Date,
  timeZone?: string,
): boolean {
  return lastSnapshotAt === undefined || dayKey(lastSnapshotAt, timeZone) !== dayKey(now, timeZone);
}

/** Ids of the snapshots beyond the newest `keep` ones. */
export function snapshotsToDelete(
  snapshots: readonly { id: string; createdAt: string }[],
  keep = SNAPSHOT_KEEP,
): string[] {
  return [...snapshots]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(keep)
    .map((snapshot) => snapshot.id);
}

export interface ReminderInput {
  /** Whether there is anything worth backing up (at least one card). */
  hasData: boolean;
  lastExportedAt?: string;
  snoozedUntil?: string;
  /** Creation of the oldest card: a fresh install is not reminded right away. */
  firstDataAt?: string;
  now: Date;
}

/**
 * The reminder shows when the last exported backup is older than BACKUP_REMINDER_DAYS – or,
 * without any export, when the oldest data is that old – unless it was snoozed.
 */
export function isBackupReminderDue({
  hasData,
  lastExportedAt,
  snoozedUntil,
  firstDataAt,
  now,
}: ReminderInput): boolean {
  if (!hasData) return false;
  if (snoozedUntil && Date.parse(snoozedUntil) > now.getTime()) return false;
  const since = lastExportedAt ?? firstDataAt;
  if (!since) return false;
  return now.getTime() - Date.parse(since) >= BACKUP_REMINDER_DAYS * DAY_MS;
}

/** Whole days since the given instant (0 for today). */
export function daysSince(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / DAY_MS));
}

export function snoozeUntil(now: Date): string {
  return new Date(now.getTime() + BACKUP_SNOOZE_DAYS * DAY_MS).toISOString();
}

/** File-name friendly version of a project name: "Japanisch N5" → "japanisch-n5". */
export function slugify(name: string): string {
  const slug = name
    .toLocaleLowerCase('de-DE')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug || 'projekt';
}

/** synapse-backup-2026-10-01.json (local date). */
export function backupFileName(now: Date, timeZone?: string): string {
  return `synapse-backup-${dayKey(now, timeZone)}.json`;
}

/** synapse-<projekt>-2026-10-01.json/.csv, or synapse-export-… for everything. */
export function exportFileName(
  projectName: string | null,
  extension: 'json' | 'csv',
  now: Date,
  timeZone?: string,
): string {
  const name = projectName === null ? 'export' : slugify(projectName);
  return `synapse-${name}-${dayKey(now, timeZone)}.${extension}`;
}
