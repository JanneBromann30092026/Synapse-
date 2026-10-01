import { FORMAT_VERSION, SYNAPSE_FORMAT, type SynapseFile } from '@/core/backup/format';
import {
  planImport,
  findConflicts,
  type ConflictStrategy,
  type ProjectOutcome,
} from '@/core/backup/plan';
import { snapshotsToDelete, SNAPSHOT_KEEP } from '@/core/backup/schedule';
import { db } from '../db';
import { RecordNotFoundError } from '../errors';
import {
  CROSS_PROJECT_ID,
  type CardLink,
  type Setting,
  type Snapshot,
  type SnapshotReason,
} from '../types';
import { rebuildSchedules, refreshSchedules } from '../scheduling';
import { compact, newId, nowIso } from '../util';
import { LINK_STATE_KEY } from './brainRepo';

/** Settings of the backup feature itself stay on the device (a restore must not reset them). */
export const BACKUP_SETTING_PREFIX = 'backup.';
export const LAST_EXPORTED_KEY = 'backup.lastExportedAt';
export const REMINDER_SNOOZED_KEY = 'backup.reminderSnoozedUntil';

export type ExportScope = { projectId: string } | 'all';

export interface ExportOptions {
  /** Study sessions and answers. */
  includeHistory: boolean;
}

function isManual(link: CardLink): link is CardLink & { kind: 'manual' } {
  return link.kind === 'manual';
}

/** Settings that belong into a backup: no link state (embeddings are not backed up). */
function backupSettings(settings: Setting[]): Setting[] {
  return settings.filter(
    (setting) => setting.key !== LINK_STATE_KEY && !setting.key.startsWith(BACKUP_SETTING_PREFIX),
  );
}

function fileHeader(kind: SynapseFile['kind']) {
  return {
    format: SYNAPSE_FORMAT,
    version: FORMAT_VERSION,
    kind,
    exportedAt: nowIso(),
    appVersion: __APP_VERSION__,
  } as const;
}

const EMPTY_BACKUP_PARTS = {
  gradingCache: [],
  graphPositions: [],
  linkExplanations: [],
  settings: [],
} satisfies Partial<SynapseFile>;

export interface ImportFileOptions {
  strategies?: Readonly<Record<string, ConflictStrategy>>;
  includeHistory: boolean;
}

export interface ImportFileResult {
  outcomes: ProjectOutcome[];
  projectsAdded: number;
  cardsAdded: number;
  duplicatesSkipped: number;
  answersAdded: number;
}

export interface BackupStatus {
  lastExportedAt?: string;
  snoozedUntil?: string;
  /** Creation time of the oldest card; undefined without cards. */
  firstCardAt?: string;
}

const isoOrUndefined = (value: unknown) => (typeof value === 'string' ? value : undefined);

export const backupRepo = {
  /** Inputs of the backup reminder. */
  async status(): Promise<BackupStatus> {
    const [exported, snoozed, oldest] = await Promise.all([
      db.settings.get(LAST_EXPORTED_KEY),
      db.settings.get(REMINDER_SNOOZED_KEY),
      db.cards.orderBy('createdAt').first(),
    ]);
    return compact({
      lastExportedAt: isoOrUndefined(exported?.value),
      snoozedUntil: isoOrUndefined(snoozed?.value),
      firstCardAt: oldest?.createdAt,
    });
  },

  /**
   * Everything except embeddings and secrets: projects, cards, history, grading cache, manual
   * links, link explanations, graph positions and settings.
   */
  async collectBackup(): Promise<SynapseFile> {
    return db.transaction(
      'r',
      [
        db.projects,
        db.cards,
        db.studySessions,
        db.answers,
        db.cardLinks,
        db.gradingCache,
        db.graphPositions,
        db.linkExplanations,
        db.settings,
      ],
      async () => {
        const [
          projects,
          cards,
          studySessions,
          answers,
          links,
          gradingCache,
          graphPositions,
          linkExplanations,
          settings,
        ] = await Promise.all([
          db.projects.orderBy('sortOrder').toArray(),
          db.cards.orderBy('[projectId+createdAt]').toArray(),
          db.studySessions.orderBy('startedAt').toArray(),
          db.answers.orderBy('answeredAt').toArray(),
          db.cardLinks.where('kind').equals('manual').toArray(),
          db.gradingCache.toArray(),
          db.graphPositions.toArray(),
          db.linkExplanations.toArray(),
          db.settings.toArray(),
        ]);
        const nodeIds = new Set([...projects.map((p) => p.id), ...cards.map((c) => c.id)]);
        return {
          ...fileHeader('backup'),
          projects,
          cards,
          studySessions,
          answers,
          cardLinks: links.filter(isManual),
          gradingCache,
          // Only positions of existing nodes (the file is validated on import).
          graphPositions: graphPositions.filter((p) => nodeIds.has(p.nodeId)),
          linkExplanations,
          settings: backupSettings(settings),
        };
      },
    );
  },

  /** Projects and cards (optionally with history) in the Synapse format – no settings. */
  async collectExport(scope: ExportScope, { includeHistory }: ExportOptions): Promise<SynapseFile> {
    return db.transaction(
      'r',
      [db.projects, db.cards, db.studySessions, db.answers, db.cardLinks, db.cardSchedules],
      async () => {
        const projectId = scope === 'all' ? null : scope.projectId;
        const projects =
          scope === 'all'
            ? await db.projects.orderBy('sortOrder').toArray()
            : await db.projects.where('id').equals(scope.projectId).toArray();
        if (scope !== 'all' && projects.length === 0) {
          throw new RecordNotFoundError('project', scope.projectId);
        }
        const cards =
          scope === 'all'
            ? await db.cards.orderBy('[projectId+createdAt]').toArray()
            : await db.cards
                .where('[projectId+createdAt]')
                .between([scope.projectId, ''], [scope.projectId, '￿'])
                .toArray();
        const cardIds = new Set(cards.map((card) => card.id));
        const links = (await db.cardLinks.where('kind').equals('manual').toArray())
          .filter(isManual)
          .filter((link) => cardIds.has(link.sourceCardId) && cardIds.has(link.targetCardId));

        let studySessions: SynapseFile['studySessions'] = [];
        let answers: SynapseFile['answers'] = [];
        if (includeHistory && scope === 'all') {
          [studySessions, answers] = await Promise.all([
            db.studySessions.orderBy('startedAt').toArray(),
            db.answers.orderBy('answeredAt').toArray(),
          ]);
        } else if (includeHistory && projectId !== null) {
          // Own rounds plus the answers to its cards from rounds across projects.
          answers = await db.answers
            .where('cardId')
            .anyOf([...cardIds])
            .sortBy('answeredAt');
          const sessionIds = new Set(answers.map((answer) => answer.sessionId));
          const sessions = await db.studySessions.orderBy('startedAt').toArray();
          studySessions = sessions.filter(
            (session) =>
              session.projectId === projectId ||
              (session.projectId === CROSS_PROJECT_ID && sessionIds.has(session.id)),
          );
          const kept = new Set(studySessions.map((session) => session.id));
          answers = answers.filter((answer) => kept.has(answer.sessionId));
        }
        return {
          ...fileHeader('export'),
          projects,
          cards,
          studySessions,
          answers,
          cardLinks: links,
          ...EMPTY_BACKUP_PARTS,
        };
      },
    );
  },

  /** File project id → name of the existing project with the same name. */
  async findConflicts(file: Pick<SynapseFile, 'projects'>): Promise<Map<string, string>> {
    const projects = await db.projects.toArray();
    const conflicts = findConflicts(file, { projects });
    const names = new Map(projects.map((p) => [p.id, p.name]));
    return new Map([...conflicts].map(([fileId, dbId]) => [fileId, names.get(dbId) ?? '']));
  },

  /**
   * Adds the projects, cards, history and manual links of a Synapse file in one transaction.
   * Existing data is never changed; ids that already exist get new ones.
   */
  async importFile(file: SynapseFile, options: ImportFileOptions): Promise<ImportFileResult> {
    return db.transaction(
      'rw',
      [db.projects, db.cards, db.studySessions, db.answers, db.cardLinks, db.cardSchedules],
      async () => {
        const [projects, cards, sessionIds, answerIds, links] = await Promise.all([
          db.projects.toArray(),
          db.cards.toArray(),
          db.studySessions.toCollection().primaryKeys(),
          db.answers.toCollection().primaryKeys(),
          db.cardLinks.toArray(),
        ]);
        const usedIds = new Set<string>([
          ...projects.map((p) => p.id),
          ...cards.map((c) => c.id),
          ...sessionIds,
          ...answerIds,
          ...links.map((l) => l.id),
        ]);
        const manualLinkPairs = new Set(
          links.filter(isManual).map((l) => `${l.sourceCardId}|${l.targetCardId}`),
        );
        const plan = planImport(
          file,
          { projects, cards, usedIds, manualLinkPairs },
          { strategies: options.strategies, includeHistory: options.includeHistory, newId },
        );
        await db.projects.bulkAdd(plan.projects);
        await db.cards.bulkAdd(plan.cards);
        await db.studySessions.bulkAdd(plan.studySessions);
        await db.answers.bulkAdd(plan.answers);
        await db.cardLinks.bulkAdd(plan.cardLinks);
        await refreshSchedules(
          db,
          plan.answers.map((answer) => answer.cardId),
        );
        return {
          outcomes: plan.outcomes,
          projectsAdded: plan.projects.length,
          cardsAdded: plan.cards.length,
          duplicatesSkipped: plan.outcomes.reduce((sum, o) => sum + o.duplicatesSkipped, 0),
          answersAdded: plan.answers.length,
        };
      },
    );
  },

  /**
   * Replaces all data with the file's content (one transaction). Secrets, snapshots and the
   * backup settings stay; embeddings of cards that still exist stay (they are checked by text
   * hash), all semantic links are recomputed.
   */
  async restore(file: SynapseFile): Promise<void> {
    await db.transaction(
      'rw',
      [
        db.projects,
        db.cards,
        db.studySessions,
        db.answers,
        db.cardLinks,
        db.gradingCache,
        db.graphPositions,
        db.linkExplanations,
        db.settings,
        db.cardEmbeddings,
        db.cardSchedules,
      ],
      async () => {
        const cardIds = new Set(file.cards.map((card) => card.id));
        const embeddingIds = await db.cardEmbeddings.toCollection().primaryKeys();
        const keptSettings = (await db.settings.toArray()).filter((s) =>
          s.key.startsWith(BACKUP_SETTING_PREFIX),
        );
        await Promise.all([
          db.projects.clear(),
          db.cards.clear(),
          db.studySessions.clear(),
          db.answers.clear(),
          db.cardLinks.clear(),
          db.gradingCache.clear(),
          db.graphPositions.clear(),
          db.linkExplanations.clear(),
          db.settings.clear(),
          db.cardEmbeddings.bulkDelete(embeddingIds.filter((cardId) => !cardIds.has(cardId))),
        ]);
        await Promise.all([
          db.projects.bulkAdd(file.projects),
          db.cards.bulkAdd(file.cards),
          db.studySessions.bulkAdd(file.studySessions),
          db.answers.bulkAdd(file.answers),
          db.cardLinks.bulkAdd(file.cardLinks),
          db.gradingCache.bulkAdd(file.gradingCache),
          db.graphPositions.bulkAdd(file.graphPositions),
          db.linkExplanations.bulkAdd(file.linkExplanations),
          db.settings.bulkAdd([...backupSettings(file.settings), ...keptSettings]),
        ]);
        await rebuildSchedules(db);
      },
    );
  },
};

export type SnapshotInfo = Omit<Snapshot, 'json'> & { size: number };

export const snapshotsRepo = {
  /** Newest first, without the (large) JSON. */
  async list(): Promise<SnapshotInfo[]> {
    const snapshots = await db.snapshots.orderBy('createdAt').reverse().toArray();
    return snapshots.map(({ json, ...info }) => ({ ...info, size: json.length }));
  },

  async latestCreatedAt(): Promise<string | undefined> {
    return (await db.snapshots.orderBy('createdAt').last())?.createdAt;
  },

  async get(id: string): Promise<Snapshot | undefined> {
    return db.snapshots.get(id);
  },

  /** Stores a backup of the current data and keeps only the newest SNAPSHOT_KEEP. */
  async create(reason: SnapshotReason): Promise<Snapshot> {
    const file = await backupRepo.collectBackup();
    const snapshot: Snapshot = {
      id: newId(),
      createdAt: nowIso(),
      reason,
      projectCount: file.projects.length,
      cardCount: file.cards.length,
      answerCount: file.answers.length,
      json: JSON.stringify(file),
    };
    await db.transaction('rw', db.snapshots, async () => {
      await db.snapshots.add(snapshot);
      const all = await db.snapshots.toArray();
      await db.snapshots.bulkDelete(snapshotsToDelete(all, SNAPSHOT_KEEP));
    });
    return snapshot;
  },

  async delete(id: string): Promise<void> {
    await db.snapshots.delete(id);
  },
};
