import { useLiveData } from '@/data/live';
import {
  backupRepo,
  snapshotsRepo,
  type BackupStatus,
  type SnapshotInfo,
} from '@/data/repositories';

export function useBackupStatus(): BackupStatus | undefined {
  return useLiveData(() => backupRepo.status());
}

export function useSnapshots(): SnapshotInfo[] | undefined {
  return useLiveData(() => snapshotsRepo.list());
}
