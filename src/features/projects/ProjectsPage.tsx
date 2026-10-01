import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { Archive, ArchiveRestore, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import {
  ActionMenu,
  Button,
  cn,
  ConfirmDialog,
  EmptyState,
  Skeleton,
  toast,
  type ActionMenuItem,
  type MenuAnchor,
} from '@/components/ui';
import { Page } from '@/app/shell/Page';
import { filterProjects, mergeVisibleOrder, moveItem } from '@/core/projectList';
import { projectsRepo } from '@/data/repositories';
import type { ProjectSummary } from '@/data/types';
import { de } from '@/i18n/de';
import { useLaunchStudy } from '@/features/study/studyLaunch';
import { BackupReminder } from '@/features/transfer/BackupReminder';
import { useImport } from '@/features/transfer/useImport';
import { spring, TAP_SCALE } from '@/styles/motion';
import { useProjects } from './hooks';
import { ProjectDialog } from './ProjectDialog';
import { SortableProjectCard } from './SortableProjectCard';

const t = de.pages.projects;

function nameOf(projects: ProjectSummary[], id: string | number | undefined): string {
  return projects.find((p) => p.id === id)?.name ?? '';
}

/** Long press (touch) before a drag starts; shorter presses scroll or tap. */
const TOUCH_DRAG_DELAY_MS = 350;
/** A long press released without moving opens the action menu instead of reordering. */
const STATIONARY_PX = 10;
const CLICK_GUARD_MS = 400;

interface DialogState {
  key: number;
  open: boolean;
  project?: ProjectSummary;
}

function NewProjectTile({ onClick }: { onClick: () => void }) {
  return (
    <motion.li layout="position" transition={spring.default} className="list-none">
      <motion.button
        type="button"
        onClick={onClick}
        whileTap={{ scale: TAP_SCALE }}
        transition={spring.snappy}
        className="focus-ring no-callout flex h-full min-h-56 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-line-strong text-fg-secondary transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent"
      >
        <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Plus size={26} aria-hidden />
        </span>
        <span className="text-base font-medium">{t.newProject}</span>
      </motion.button>
    </motion.li>
  );
}

export function ProjectsPage() {
  const launchStudy = useLaunchStudy();
  const projects = useProjects();
  const imports = useImport();
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<DialogState>({ key: 0, open: false });
  const [menu, setMenu] = useState<{ project: ProjectSummary; anchor: MenuAnchor } | null>(null);
  // Kept after closing so the dialog text stays during the exit animation.
  const [toDelete, setToDelete] = useState<{ project: ProjectSummary; open: boolean } | null>(null);
  const [sorting, setSorting] = useState(false);
  // Order applied locally until the database change arrives through liveQuery.
  const [optimistic, setOptimistic] = useState<{ base: ProjectSummary[]; ids: string[] } | null>(
    null,
  );
  const dragging = useRef(false);
  const dragEndedAt = useRef(0);

  // dnd-kit stops the click that ends a drag in the document capture phase (so React never
  // sees it) but does not prevent the link navigation – do that earlier, on window.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (dragging.current || Date.now() - dragEndedAt.current < CLICK_GUARD_MS) {
        event.preventDefault();
      }
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, []);

  const ordered = useMemo(() => {
    if (!projects) return [];
    if (!optimistic || optimistic.base !== projects) return projects;
    const index = new Map(optimistic.ids.map((id, i) => [id, i]));
    return [...projects].sort((a, b) => (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0));
  }, [projects, optimistic]);

  const visible = useMemo(
    () => filterProjects(ordered, { query, showArchived }),
    [ordered, query, showArchived],
  );
  const archivedCount = ordered.filter((p) => p.archived).length;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: TOUCH_DRAG_DELAY_MS, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );

  const openCreate = () => setDialog((d) => ({ key: d.key + 1, open: true }));
  const openEdit = (project: ProjectSummary) =>
    setDialog((d) => ({ key: d.key + 1, open: true, project }));
  const closeDialog = () => setDialog((d) => ({ ...d, open: false }));

  const toggleArchive = async (project: ProjectSummary) => {
    try {
      await projectsRepo.update(project.id, { archived: !project.archived });
      toast.success(
        project.archived ? t.toasts.unarchived(project.name) : t.toasts.archived(project.name),
      );
    } catch {
      toast.error(t.toasts.failed);
    }
  };

  const deleteProject = async (project: ProjectSummary) => {
    try {
      await projectsRepo.delete(project.id);
      toast.success(t.toasts.deleted(project.name));
    } catch {
      toast.error(t.toasts.failed);
    }
  };

  const onDragEnd = ({ active, over, delta, activatorEvent }: DragEndEvent) => {
    dragging.current = false;
    dragEndedAt.current = Date.now();
    requestAnimationFrame(() => setSorting(false));
    const project = ordered.find((p) => p.id === active.id);
    if (!project || !projects) return;

    if (!over || over.id === active.id) {
      // Long press without moving: behave like a context menu.
      const touch =
        'touches' in activatorEvent ? (activatorEvent as TouchEvent).touches[0] : undefined;
      if (touch && Math.hypot(delta.x, delta.y) < STATIONARY_PX) {
        setMenu({ project, anchor: { x: touch.clientX, y: touch.clientY } });
      }
      return;
    }

    const visibleIds = visible.map((p) => p.id);
    const newVisible = moveItem(
      visibleIds,
      visibleIds.indexOf(String(active.id)),
      visibleIds.indexOf(String(over.id)),
    );
    const ids = mergeVisibleOrder(
      ordered.map((p) => p.id),
      newVisible,
    );
    setOptimistic({ base: projects, ids });
    projectsRepo.reorder(ids).catch(() => {
      setOptimistic(null);
      toast.error(t.toasts.failed);
    });
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => t.dnd.picked(nameOf(ordered, active.id)),
    onDragOver: ({ active, over }) =>
      over ? t.dnd.over(nameOf(ordered, active.id), nameOf(ordered, over.id)) : undefined,
    onDragEnd: ({ active }) => t.dnd.dropped(nameOf(ordered, active.id)),
    onDragCancel: ({ active }) => t.dnd.cancelled(nameOf(ordered, active.id)),
  };

  const menuItems: ActionMenuItem[] = menu
    ? [
        { id: 'edit', label: t.menu.edit, icon: Pencil, onSelect: () => openEdit(menu.project) },
        {
          id: 'archive',
          label: menu.project.archived ? t.menu.unarchive : t.menu.archive,
          icon: menu.project.archived ? ArchiveRestore : Archive,
          onSelect: () => void toggleArchive(menu.project),
        },
        {
          id: 'delete',
          label: t.menu.delete,
          icon: Trash2,
          danger: true,
          onSelect: () => setToDelete({ project: menu.project, open: true }),
        },
      ]
    : [];

  const hasProjects = ordered.length > 0;

  return (
    <Page
      title={t.title}
      actions={
        <>
          <Button
            variant="ghost"
            icon={Upload}
            onClick={imports.pickFile}
            data-testid="projects-import"
          >
            {de.transfer.import}
          </Button>
          {hasProjects && (
            <Button icon={Plus} onClick={openCreate}>
              {t.newProject}
            </Button>
          )}
        </>
      }
    >
      {projects === undefined ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : !hasProjects ? (
        <EmptyState
          title={t.emptyTitle}
          text={t.emptyText}
          action={
            <Button icon={Plus} size="lg" onClick={openCreate}>
              {t.emptyAction}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          <BackupReminder />
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative min-w-56 flex-1 sm:max-w-sm">
              <span className="sr-only">{t.search}</span>
              <Search
                size={18}
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-fg-muted"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.searchPlaceholder}
                aria-label={t.search}
                enterKeyHint="search"
                className="min-h-11 w-full rounded-full border border-line bg-surface py-2 pr-4 pl-11 text-base text-fg shadow-soft outline-none placeholder:text-fg-muted focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)]"
              />
            </label>
            <button
              type="button"
              aria-pressed={showArchived}
              onClick={() => setShowArchived((v) => !v)}
              className={cn(
                'focus-ring no-callout flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
                showArchived
                  ? 'border-transparent bg-accent-soft text-accent'
                  : 'border-line bg-surface text-fg-secondary hover:text-fg',
              )}
            >
              <Archive size={16} aria-hidden />
              {t.showArchived}
              {archivedCount > 0 && (
                <span className="tabular-nums opacity-70">({archivedCount})</span>
              )}
            </button>
          </div>

          <DndContext
            sensors={sensors}
            accessibility={{
              screenReaderInstructions: { draggable: t.dnd.instructions },
              announcements,
            }}
            collisionDetection={closestCenter}
            onDragStart={() => {
              dragging.current = true;
              setSorting(true);
            }}
            onDragCancel={() => {
              dragging.current = false;
              dragEndedAt.current = Date.now();
              setSorting(false);
            }}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={visible.map((p) => p.id)} strategy={rectSortingStrategy}>
              <ul
                className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4"
                aria-label={t.title}
              >
                {!query && <NewProjectTile onClick={openCreate} />}
                <AnimatePresence initial={false}>
                  {visible.map((project) => (
                    <SortableProjectCard
                      key={project.id}
                      project={project}
                      layoutEnabled={!sorting}
                      onMenu={(p, anchor) => setMenu({ project: p, anchor })}
                      onStudy={(p) => launchStudy(p, '/projects')}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            </SortableContext>
          </DndContext>

          {visible.length === 0 && (
            <p className="px-1 text-base text-fg-secondary" role="status">
              {query ? t.noResults(query) : t.noResultsArchived}
            </p>
          )}
        </div>
      )}

      {imports.element}
      <ProjectDialog
        key={dialog.key}
        open={dialog.open}
        project={dialog.project}
        onClose={closeDialog}
      />
      <ActionMenu
        open={menu !== null}
        anchor={menu?.anchor ?? null}
        items={menuItems}
        label={menu ? t.menuLabel(menu.project.name) : undefined}
        onClose={() => setMenu(null)}
      />
      <ConfirmDialog
        open={toDelete?.open ?? false}
        onClose={() => setToDelete((d) => (d ? { ...d, open: false } : null))}
        onConfirm={() => (toDelete ? deleteProject(toDelete.project) : undefined)}
        title={toDelete ? t.deleteTitle(toDelete.project.name) : ''}
        message={toDelete ? t.deleteMessage(toDelete.project.cardCount) : undefined}
        confirmLabel={t.deleteConfirm}
      />
    </Page>
  );
}
