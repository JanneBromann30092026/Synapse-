import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  CheckSquare,
  FolderInput,
  LayoutGrid,
  List,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  ActionMenu,
  Button,
  cn,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Modal,
  ProjectAvatar,
  Select,
  Skeleton,
  toast,
  type ActionMenuItem,
  type MenuAnchor,
} from '@/components/ui';
import { Page } from '@/app/shell/Page';
import { useHotkeys } from '@/app/hooks/useHotkeys';
import { collectTags } from '@/core/cards';
import { cardsRepo } from '@/data/repositories';
import type { Card } from '@/data/types';
import { CardEditor } from '@/features/cards/CardEditor';
import { CardRow } from '@/features/cards/CardRow';
import { CardTile } from '@/features/cards/CardTile';
import { useCards, useDebouncedValue } from '@/features/cards/hooks';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';
import { studyLayoutId, useLaunchStudy, useStudyLaunch } from '@/features/study/studyLaunch';
import { useProject, useProjects } from './hooks';
import { ProjectDialog } from './ProjectDialog';

const t = de.pages.project;
const SEARCH_DEBOUNCE_MS = 200;

type View = 'list' | 'grid';

interface EditorState {
  key: number;
  open: boolean;
  card?: Card;
}

interface Pending<T> {
  value: T;
  open: boolean;
}

function sameTag(a: string, b: string) {
  return a.toLocaleLowerCase('de-DE') === b.toLocaleLowerCase('de-DE');
}

export function ProjectPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const project = useProject(projectId);
  const projects = useProjects();
  const allCards = useCards(projectId);
  const launchStudy = useLaunchStudy();
  // Re-renders the study button when the launch starts, so the shared layout has its position.
  const launching = useStudyLaunch((s) => s.stage !== 'idle' && s.projectId === projectId);

  const [query, setQuery] = useState('');
  const search = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const searched = useCards(projectId, search);
  const [tag, setTag] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>({ key: 0, open: false });
  const [projectDialog, setProjectDialog] = useState({ key: 0, open: false });
  const [menu, setMenu] = useState<{ card: Card; anchor: MenuAnchor } | null>(null);
  const [toDelete, setToDelete] = useState<Pending<Card> | null>(null);
  const [deleteMany, setDeleteMany] = useState(false);
  const [move, setMove] = useState<Pending<string> | null>(null);

  const tags = useMemo(() => collectTags(allCards ?? []), [allCards]);
  const activeTag = tag && tags.some((t2) => sameTag(t2, tag)) ? tag : null;
  const visible = useMemo(
    () =>
      (searched ?? []).filter(
        (card) => !activeTag || card.tags.some((t2) => sameTag(t2, activeTag)),
      ),
    [searched, activeTag],
  );
  const moveTargets = (projects ?? []).filter((p) => p.id !== projectId && !p.archived);

  const openCreate = () => setEditor((e) => ({ key: e.key + 1, open: true }));
  const openEdit = (card: Card) => setEditor((e) => ({ key: e.key + 1, open: true, card }));
  const closeEditor = () => setEditor((e) => ({ ...e, open: false }));

  useHotkeys([{ combo: 'n', handler: openCreate }], !editor.open && project != null);

  const toggleSelected = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const deleteCard = async (card: Card) => {
    try {
      await cardsRepo.delete(card.id);
      toast.success(t.toasts.deleted);
    } catch {
      toast.error(t.toasts.failed);
    }
  };

  const deleteSelected = async () => {
    const ids = [...selected];
    try {
      await cardsRepo.deleteMany(ids);
      toast.success(t.toasts.deletedMany(ids.length));
      stopSelecting();
    } catch {
      toast.error(t.toasts.failed);
    }
  };

  const moveSelected = async (targetId: string) => {
    const ids = [...selected];
    const target = moveTargets.find((p) => p.id === targetId);
    if (!target) return;
    try {
      await cardsRepo.moveToProject(ids, targetId);
      toast.success(t.toasts.moved(ids.length, target.name));
      setMove((m) => (m ? { ...m, open: false } : null));
      stopSelecting();
    } catch {
      toast.error(t.toasts.failed);
    }
  };

  const menuItems: ActionMenuItem[] = menu
    ? [
        { id: 'edit', label: t.menu.edit, icon: Pencil, onSelect: () => openEdit(menu.card) },
        {
          id: 'delete',
          label: t.menu.delete,
          icon: Trash2,
          danger: true,
          onSelect: () => setToDelete({ value: menu.card, open: true }),
        },
      ]
    : [];

  const back = (
    <IconButton
      icon={ArrowLeft}
      label={t.back}
      onClick={() => void navigate('/projects')}
      className="-ml-2"
    />
  );

  if (project === undefined) {
    return (
      <Page title="" leading={back}>
        <Skeleton className="h-40 w-full rounded-xl" />
      </Page>
    );
  }

  if (project === null) {
    return (
      <Page title={t.title} leading={back}>
        <EmptyState
          title={t.notFound}
          action={
            <Button variant="secondary" onClick={() => void navigate('/projects')}>
              {t.back}
            </Button>
          }
        />
      </Page>
    );
  }

  const cardCount = allCards?.length ?? 0;
  const summary = projects?.find((p) => p.id === project.id);

  return (
    <Page
      title={project.name}
      leading={
        <>
          {back}
          <ProjectAvatar color={project.color} icon={project.icon} size={40} />
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-24">
        {/* Header: description, count and main actions */}
        <section className="flex flex-col gap-4">
          {project.description && (
            <p className="max-w-2xl text-base text-fg-secondary">{project.description}</p>
          )}
          <p className="text-sm font-medium text-fg-muted" data-testid="card-count">
            {de.pages.projects.cardCount(cardCount)}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              icon={Play}
              layoutId={studyLayoutId(project.id)}
              data-launching={launching || undefined}
              style={{ borderRadius: 28 }}
              onClick={() => launchStudy(project, `/projects/${project.id}`)}
            >
              {t.study}
            </Button>
            <Button size="lg" variant="secondary" icon={Plus} onClick={openCreate}>
              {t.addCard}
            </Button>
            <Button
              size="lg"
              variant="ghost"
              icon={Pencil}
              onClick={() => setProjectDialog((d) => ({ key: d.key + 1, open: true }))}
            >
              {t.edit}
            </Button>
          </div>
        </section>

        {allCards === undefined ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : cardCount === 0 ? (
          <EmptyState
            title={t.emptyTitle}
            text={t.emptyText}
            action={
              <Button size="lg" icon={Plus} onClick={openCreate}>
                {t.emptyAction}
              </Button>
            }
          />
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-56 flex-1">
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
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="min-h-11 w-full rounded-full border border-line bg-surface py-2 pr-4 pl-11 text-base text-fg shadow-soft outline-none placeholder:text-fg-muted focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)]"
                />
              </label>
              <div className="flex rounded-full border border-line bg-surface p-0.5 shadow-soft">
                <IconButton
                  icon={List}
                  label={t.viewList}
                  active={view === 'list'}
                  aria-pressed={view === 'list'}
                  onClick={() => setView('list')}
                />
                <IconButton
                  icon={LayoutGrid}
                  label={t.viewGrid}
                  active={view === 'grid'}
                  aria-pressed={view === 'grid'}
                  onClick={() => setView('grid')}
                />
              </div>
              <Button
                variant={selecting ? 'primary' : 'secondary'}
                size="sm"
                icon={selecting ? X : CheckSquare}
                onClick={() =>
                  selecting ? stopSelecting() : (setSelecting(true), setOpenRow(null))
                }
              >
                {selecting ? t.cancelSelection : t.select}
              </Button>
            </div>

            {/* Tag filter */}
            {tags.length > 0 && (
              <div
                role="group"
                aria-label={t.tagFilter}
                className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
              >
                {[null, ...tags].map((value) => {
                  const active =
                    value === null
                      ? activeTag === null
                      : activeTag !== null && sameTag(value, activeTag);
                  return (
                    <button
                      key={value ?? '__all'}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setTag(value)}
                      className={cn(
                        'focus-ring no-callout flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors',
                        active
                          ? 'border-transparent bg-accent-soft text-accent'
                          : 'border-line bg-surface text-fg-secondary hover:text-fg',
                      )}
                    >
                      {value ?? t.allTags}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Cards */}
            {searched !== undefined && visible.length === 0 ? (
              <p role="status" className="px-1 text-base text-fg-secondary">
                {t.noResults}
              </p>
            ) : view === 'list' ? (
              <ul className="flex flex-col gap-2" aria-label={t.viewList}>
                <AnimatePresence initial={false}>
                  {visible.map((card) => (
                    <CardRow
                      key={card.id}
                      card={card}
                      selecting={selecting}
                      selected={selected.has(card.id)}
                      swipeOpen={openRow === card.id}
                      onSwipeOpenChange={(isOpen) => setOpenRow(isOpen ? card.id : null)}
                      onOpen={() => openEdit(card)}
                      onToggleSelect={() => toggleSelected(card.id)}
                      onDelete={() => setToDelete({ value: card, open: true })}
                      onMenu={(anchor) => setMenu({ card, anchor })}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            ) : (
              <ul
                className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3"
                aria-label={t.viewGrid}
              >
                <AnimatePresence initial={false}>
                  {visible.map((card) => (
                    <CardTile
                      key={card.id}
                      card={card}
                      color={project.color}
                      selecting={selecting}
                      selected={selected.has(card.id)}
                      onToggleSelect={() => toggleSelected(card.id)}
                      onMenu={(anchor) => setMenu({ card, anchor })}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </>
        )}
      </div>

      {/* Selection actions */}
      <AnimatePresence>
        {selecting && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={spring.default}
            className="pointer-events-none sticky bottom-4 z-20 -mt-20 flex justify-center"
          >
            <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-full border border-line bg-surface-raised py-1.5 pr-1.5 pl-5 shadow-float">
              <span className="text-sm font-medium text-fg" aria-live="polite">
                {t.selected(selected.size)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set(visible.map((c) => c.id)))}
              >
                {t.selectAll}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={FolderInput}
                disabled={selected.size === 0}
                onClick={() => setMove({ value: moveTargets[0]?.id ?? '', open: true })}
              >
                {t.moveSelected}
              </Button>
              <Button
                size="sm"
                variant="danger"
                icon={Trash2}
                disabled={selected.size === 0}
                onClick={() => setDeleteMany(true)}
              >
                {t.deleteSelected}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <CardEditor
        key={editor.key}
        open={editor.open}
        onClose={closeEditor}
        projectId={project.id}
        card={editor.card}
        projectTags={tags}
      />
      <ProjectDialog
        key={`project-${projectDialog.key}`}
        open={projectDialog.open}
        project={summary ?? project}
        onClose={() => setProjectDialog((d) => ({ ...d, open: false }))}
      />
      <ActionMenu
        open={menu !== null}
        anchor={menu?.anchor ?? null}
        items={menuItems}
        label={t.cardActions}
        onClose={() => setMenu(null)}
      />
      <ConfirmDialog
        open={toDelete?.open ?? false}
        onClose={() => setToDelete((d) => (d ? { ...d, open: false } : null))}
        onConfirm={() => (toDelete ? deleteCard(toDelete.value) : undefined)}
        title={t.deleteCardTitle}
        message={toDelete ? t.deleteCardMessage(toDelete.value.front) : undefined}
        confirmLabel={t.deleteConfirm}
      />
      <ConfirmDialog
        open={deleteMany}
        onClose={() => setDeleteMany(false)}
        onConfirm={deleteSelected}
        title={t.deleteManyTitle(selected.size)}
        message={t.deleteManyMessage}
        confirmLabel={t.deleteConfirm}
      />
      <Modal
        open={move?.open ?? false}
        onClose={() => setMove((m) => (m ? { ...m, open: false } : null))}
        title={t.moveTitle(selected.size)}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setMove((m) => (m ? { ...m, open: false } : null))}
            >
              {de.ui.cancel}
            </Button>
            <Button
              icon={FolderInput}
              disabled={!move?.value}
              onClick={() => move?.value && void moveSelected(move.value)}
            >
              {t.moveConfirm}
            </Button>
          </>
        }
      >
        {moveTargets.length === 0 ? (
          <p className="text-base text-fg-secondary">{t.moveNoTarget}</p>
        ) : (
          <Select
            label={t.moveTarget}
            options={moveTargets.map((p) => ({ value: p.id, label: p.name }))}
            value={move?.value ?? ''}
            onChange={(value) => setMove((m) => (m ? { ...m, value } : { value, open: true }))}
          />
        )}
      </Modal>
    </Page>
  );
}
