import { validateSynapseFile, type ParsedFile, type SynapseFile } from '@/core/backup/format';
import { isSnapshotDue } from '@/core/backup/schedule';
import {
  backupRepo,
  LAST_EXPORTED_KEY,
  projectsRepo,
  settingsRepo,
  snapshotsRepo,
} from '@/data/repositories';
import { nowIso } from '@/data/util';

/** Session snapshots of running study rounds (see studyController). */
const STUDY_STORAGE_PREFIX = 'synapse.study.';

/** At most one automatic snapshot per day, only when there is something to back up. */
export async function runAutoSnapshot(now = new Date()): Promise<boolean> {
  try {
    if ((await projectsRepo.count()) === 0) return false;
    if (!isSnapshotDue(await snapshotsRepo.latestCreatedAt(), now)) return false;
    await snapshotsRepo.create('auto');
    return true;
  } catch (error: unknown) {
    console.error('Automatic snapshot failed', error);
    return false;
  }
}

export async function markBackupExported(): Promise<void> {
  await settingsRepo.set(LAST_EXPORTED_KEY, nowIso());
}

export async function readSnapshot(id: string): Promise<ParsedFile> {
  const snapshot = await snapshotsRepo.get(id);
  if (!snapshot) return { ok: false, code: 'invalid' };
  try {
    return validateSynapseFile(JSON.parse(snapshot.json));
  } catch {
    return { ok: false, code: 'notJson' };
  }
}

/**
 * Replaces all data with the file. Takes a snapshot first (the way back), and forgets
 * running study rounds that might refer to cards that no longer exist. Reload afterwards.
 */
export async function restoreBackup(file: SynapseFile): Promise<void> {
  await snapshotsRepo.create('beforeRestore');
  await backupRepo.restore(file);
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(STUDY_STORAGE_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    // sessionStorage unavailable: nothing to forget.
  }
}
