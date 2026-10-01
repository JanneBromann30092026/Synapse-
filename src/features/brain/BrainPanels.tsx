import { useState, type ReactNode } from 'react';
import { motion, useDragControls, type PanInfo } from 'motion/react';
import { Link2, Pencil, Play, Sparkles, Trash2, X } from 'lucide-react';
import {
  Badge,
  Button,
  cn,
  IconButton,
  Input,
  Modal,
  projectColor,
  Skeleton,
  Spinner,
  toast,
} from '@/components/ui';
import { useOnline } from '@/app/hooks/useOnline';
import type { BrainLink } from '@/core/brain/graph';
import { searchCards, type HubSummary } from '@/core/brain/interaction';
import { useLiveData } from '@/data/live';
import {
  brainRepo,
  cardsRepo,
  linkExplanationsRepo,
  linksRepo,
  secretsRepo,
  type CardDetail,
} from '@/data/repositories';
import { CROSS_PROJECT_ID, type Project, type ProjectColor } from '@/data/types';
import { studyLayoutId, useStudyLaunch } from '@/features/study/studyLaunch';
import { MasteryBar } from '@/features/stats/MasteryBar';
import { MASTERY_BG, masteryText } from '@/features/stats/masteryUi';
import { useSettings } from '@/features/settings/settingsStore';
import { de } from '@/i18n/de';
import { AiError, type AiErrorCode } from '@/services/ai/types';
import { linkExplainer } from '@/services/brain/explainLink';
import { spring } from '@/styles/motion';
import { glass } from './BrainOverlays';

const t = de.pages.brain.explore;

export type PanelLayout = 'side' | 'sheet';
/** Width of the side panel (landscape) in px, incl. its margin. */
export const SIDE_PANEL_SPACE = 24 * 16 + 32;
/** Share of the view height the bottom sheet takes at most (portrait). */
export const SHEET_HEIGHT_SHARE = 0.55;

const dateFormat = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' });

function ProjectDot({ color, className }: { color: ProjectColor; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('size-2.5 shrink-0 rounded-full', className)}
      style={{ background: projectColor(color), boxShadow: `0 0 8px ${projectColor(color)}` }}
    />
  );
}

// Container ----------------------------------------------------------------------------------

export interface BrainPanelProps {
  layout: PanelLayout;
  /** Small line above the title (project, kind). */
  eyebrow: ReactNode;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  testId: string;
}

const CLOSE_OFFSET_PX = 100;
const CLOSE_VELOCITY = 500;

/**
 * Non-modal detail panel: on the right in landscape, a bottom sheet in portrait (swipe the
 * handle down to close). The graph stays visible and tappable next to it.
 */
export function BrainPanel({
  layout,
  eyebrow,
  title,
  onClose,
  children,
  footer,
  testId,
}: BrainPanelProps) {
  const dragControls = useDragControls();
  const side = layout === 'side';
  const onDragEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    if (info.offset.y > CLOSE_OFFSET_PX || info.velocity.y > CLOSE_VELOCITY) onClose();
  };

  return (
    <motion.section
      role="region"
      aria-label={typeof title === 'string' ? title : undefined}
      data-testid={testId}
      data-layout={layout}
      initial={side ? { x: '110%', opacity: 0.6 } : { y: '100%' }}
      animate={side ? { x: 0, opacity: 1 } : { y: 0 }}
      exit={side ? { x: '110%', opacity: 0.6 } : { y: '100%' }}
      transition={spring.default}
      drag={side ? false : 'y'}
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.04, bottom: 0.7 }}
      onDragEnd={onDragEnd}
      className={cn(
        'pointer-events-auto absolute z-20 flex flex-col overflow-hidden text-fg',
        glass,
        'bg-surface/80',
        side
          ? 'top-[max(4.75rem,calc(env(safe-area-inset-top)+3.75rem))] right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] w-[24rem] rounded-2xl'
          : 'inset-x-0 bottom-0 max-h-[55dvh] rounded-t-3xl border-b-0 pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <header
        className={cn(
          'flex shrink-0 flex-col gap-1 px-5 pt-3 pb-3',
          !side && 'no-callout cursor-grab touch-none active:cursor-grabbing',
        )}
        onPointerDown={side ? undefined : (event) => dragControls.start(event)}
      >
        {!side && (
          <span aria-hidden className="mx-auto mb-1 h-1.5 w-11 rounded-full bg-line-strong" />
        )}
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1 pt-2">
            <div className="flex items-center gap-2 text-xs font-medium text-fg-secondary">
              {eyebrow}
            </div>
            <h2 className="text-xl leading-tight font-semibold tracking-tight break-words text-fg">
              {title}
            </h2>
          </div>
          <IconButton
            icon={X}
            label={t.close}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
            data-testid="brain-panel-close"
          />
        </div>
      </header>
      <div className="scroll-area min-h-0 flex-1 overscroll-contain px-5 pb-4">{children}</div>
      {footer && (
        <footer className="flex shrink-0 flex-col gap-2 border-t border-line px-5 pt-3 pb-4">
          {footer}
        </footer>
      )}
    </motion.section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 pt-4">
      <h3 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

// Card ---------------------------------------------------------------------------------------

export interface CardPanelProps {
  cardId: string;
  layout: PanelLayout;
  /** Cards in a "Nachbarschaft lernen" round. */
  studyCount: number;
  onClose: () => void;
  onSelectCard: (id: string) => void;
  onEdit: (detail: CardDetail) => void;
  onStudy: (detail: CardDetail) => void;
  onAddLink: (cardId: string) => void;
}

export function CardPanel({
  cardId,
  layout,
  studyCount,
  onClose,
  onSelectCard,
  onEdit,
  onStudy,
  onAddLink,
}: CardPanelProps) {
  const detail = useLiveData(async () => (await brainRepo.getCardDetail(cardId)) ?? null, [cardId]);
  // Re-renders the button when the launch starts, so the shared layout has its position.
  const launching = useStudyLaunch((s) => s.stage !== 'idle' && s.projectId === CROSS_PROJECT_ID);

  if (!detail) {
    return (
      <BrainPanel
        layout={layout}
        eyebrow={t.card.label}
        title={<Skeleton className="h-7 w-40 rounded-lg" />}
        onClose={onClose}
        testId="brain-card-panel"
      >
        <Skeleton className="mt-3 h-24 w-full rounded-xl" />
      </BrainPanel>
    );
  }

  const { card, project, mastery, recent, links } = detail;
  const history = [...recent].reverse();

  return (
    <BrainPanel
      layout={layout}
      eyebrow={
        <>
          <ProjectDot color={project.color} />
          <span className="truncate">{project.name}</span>
        </>
      }
      title={card.front}
      onClose={onClose}
      testId="brain-card-panel"
      footer={
        <>
          <Button
            icon={Play}
            fullWidth
            layoutId={studyLayoutId(CROSS_PROJECT_ID)}
            data-launching={launching || undefined}
            style={{ borderRadius: 28 }}
            onClick={() => onStudy(detail)}
            data-testid="brain-study-neighborhood"
          >
            {t.card.studyNeighborhood}
          </Button>
          <p className="-mt-1 text-center text-xs text-fg-secondary">
            {t.card.studyNeighborhoodHint(studyCount)}
          </p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-2">
            <Button variant="secondary" icon={Pencil} onClick={() => onEdit(detail)}>
              {t.card.edit}
            </Button>
            <Button
              variant="secondary"
              icon={Link2}
              onClick={() => onAddLink(card.id)}
              data-testid="brain-add-link"
            >
              {t.card.addLink}
            </Button>
          </div>
        </>
      }
    >
      <motion.div
        key={card.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.soft}
        className="flex flex-col"
      >
        <p className="text-base whitespace-pre-wrap text-fg" data-testid="brain-card-back">
          {card.back}
        </p>
        {card.notes && (
          <Section title={t.card.notes}>
            <p className="text-sm whitespace-pre-wrap text-fg-secondary">{card.notes}</p>
          </Section>
        )}
        {card.tags.length > 0 && (
          <Section title={t.card.tags}>
            <ul className="flex flex-wrap gap-1.5">
              {card.tags.map((tag) => (
                <li key={tag}>
                  <Badge>#{tag}</Badge>
                </li>
              ))}
            </ul>
          </Section>
        )}
        <Section title={t.card.mastery}>
          <p className="flex items-center gap-2 text-sm text-fg">
            <span
              aria-hidden
              className={cn('size-3 shrink-0 rounded-full', MASTERY_BG[mastery.level])}
            />
            <span>{masteryText(mastery)}</span>
          </p>
          <div className="flex flex-col gap-1.5" data-testid="brain-card-history">
            <span className="text-xs text-fg-secondary">{t.card.history}</span>
            {history.length === 0 ? (
              <span className="text-sm text-fg-secondary">{t.card.historyEmpty}</span>
            ) : (
              <ol className="flex flex-wrap items-center gap-1.5">
                {history.map((answer, index) => {
                  const label = t.card.answer(
                    answer.verdict === 'correct',
                    dateFormat.format(new Date(answer.answeredAt)),
                  );
                  return (
                    <motion.li
                      key={answer.id}
                      title={label}
                      aria-label={label}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ ...spring.snappy, delay: index * 0.03 }}
                      className={cn(
                        'size-3.5 rounded-full',
                        answer.verdict === 'correct' ? 'bg-success' : 'bg-danger',
                      )}
                    />
                  );
                })}
              </ol>
            )}
          </div>
        </Section>
        <Section title={t.card.links}>
          {links.length === 0 ? (
            <p className="text-sm text-fg-secondary">{t.card.linksEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-1.5" data-testid="brain-card-links">
              {links.map((link) => (
                <li key={link.linkId}>
                  <button
                    type="button"
                    onClick={() => onSelectCard(link.card.id)}
                    aria-label={t.card.openCard(link.card.front)}
                    data-cross={link.crossProject || undefined}
                    className={cn(
                      'focus-ring no-callout flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors',
                      link.crossProject
                        ? 'border-transparent bg-accent-soft'
                        : 'border-line bg-surface-sunken/60',
                      '[@media(hover:hover)]:hover:border-line-strong',
                    )}
                  >
                    <ProjectDot
                      color={
                        link.card.projectId === project.id ? project.color : link.project.color
                      }
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium text-fg">
                        {link.card.front}
                      </span>
                      <span className="truncate text-xs text-fg-secondary">
                        {link.crossProject ? `${link.project.name} · ` : ''}
                        {link.kind === 'manual'
                          ? t.card.manual
                          : t.card.similarity(Math.round(link.weight * 100))}
                      </span>
                    </span>
                    {link.crossProject && (
                      <Sparkles
                        size={16}
                        aria-label={t.card.cross}
                        className="shrink-0 text-accent"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </motion.div>
    </BrainPanel>
  );
}

// Project hub --------------------------------------------------------------------------------

export interface HubPanelProps {
  project: Project;
  summary: HubSummary;
  projects: ReadonlyMap<string, Project>;
  layout: PanelLayout;
  onClose: () => void;
  onStudy: (project: Project) => void;
}

export function HubPanel({ project, summary, projects, layout, onClose, onStudy }: HubPanelProps) {
  const launching = useStudyLaunch((s) => s.stage !== 'idle' && s.projectId === project.id);
  return (
    <BrainPanel
      layout={layout}
      eyebrow={
        <>
          <ProjectDot color={project.color} />
          {t.hub.label}
        </>
      }
      title={project.name}
      onClose={onClose}
      testId="brain-hub-panel"
      footer={
        <Button
          icon={Play}
          fullWidth
          layoutId={studyLayoutId(project.id)}
          data-launching={launching || undefined}
          style={{ borderRadius: 28 }}
          onClick={() => onStudy(project)}
          data-testid="brain-study-project"
        >
          {t.hub.study}
        </Button>
      }
    >
      <motion.div
        key={project.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.soft}
        className="flex flex-col"
      >
        <p className="text-base text-fg tabular-nums" data-testid="brain-hub-cards">
          {t.hub.cards(summary.cards)}
        </p>
        <Section title={t.hub.mastery}>
          <MasteryBar counts={summary.levels} legend />
        </Section>
        <Section title={t.hub.cross}>
          {summary.crossByProject.length === 0 ? (
            <p className="text-sm text-fg-secondary">{t.hub.crossNone}</p>
          ) : (
            <>
              <p className="text-sm text-fg" data-testid="brain-hub-cross">
                {t.hub.crossCount(summary.crossTotal)}
              </p>
              <ul className="flex flex-col gap-1.5">
                {summary.crossByProject.map(({ projectId, count }) => {
                  const other = projects.get(projectId);
                  if (!other) return null;
                  return (
                    <li
                      key={projectId}
                      className="flex min-h-9 items-center gap-2.5 rounded-xl bg-surface-sunken/60 px-3 text-sm"
                    >
                      <ProjectDot color={other.color} />
                      <span className="min-w-0 flex-1 truncate text-fg">{other.name}</span>
                      <span className="text-fg-secondary tabular-nums">{count}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Section>
      </motion.div>
    </BrainPanel>
  );
}

// Link popover -------------------------------------------------------------------------------

export interface LinkPopoverProps {
  link: BrainLink;
  /** Tap position relative to the view. */
  at: { x: number; y: number };
  view: { width: number; height: number };
  projects: ReadonlyMap<string, Project>;
  onClose: () => void;
  onSelectCard: (id: string) => void;
}

const POPOVER_WIDTH = 340;

export function LinkPopover({ link, at, view, projects, onClose, onSelectCard }: LinkPopoverProps) {
  const pair = useLiveData(async () => {
    const [a, b] = await Promise.all([cardsRepo.get(link.a.id), cardsRepo.get(link.b.id)]);
    const cached = a && b ? await linkExplanationsRepo.get(a, b) : undefined;
    return { a: a ?? null, b: b ?? null, explanation: cached?.explanation ?? null };
  }, [link.a.id, link.b.id]);
  const aiProvider = useSettings((s) => s.aiProvider);
  const hasKey = useLiveData(() => secretsRepo.has('anthropicApiKey'));
  const online = useOnline();
  const [state, setState] = useState<{ loading: boolean; error: AiErrorCode | null }>({
    loading: false,
    error: null,
  });

  const unavailable =
    aiProvider === 'off'
      ? t.link.aiOff
      : hasKey === false
        ? t.link.noKey
        : !online
          ? t.link.offline
          : null;

  const explain = async () => {
    if (!pair?.a || !pair.b) return;
    setState({ loading: true, error: null });
    try {
      await linkExplainer.explain(pair.a, pair.b);
      setState({ loading: false, error: null });
    } catch (error: unknown) {
      setState({ loading: false, error: error instanceof AiError ? error.code : 'API_ERROR' });
    }
  };

  const remove = async () => {
    await linksRepo.removeManual(link.id);
    toast.info(t.link.removed);
    onClose();
  };

  const width = Math.min(POPOVER_WIDTH, view.width - 32);
  const left = Math.min(Math.max(16, at.x - width / 2), view.width - width - 16);
  const below = at.y < view.height * 0.5;
  const percent = Math.round(link.weight * 100);

  return (
    <motion.div
      role="dialog"
      aria-label={t.link.label}
      data-testid="brain-link-popover"
      initial={{ opacity: 0, scale: 0.94, y: below ? -6 : 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={spring.default}
      style={{
        left,
        width,
        ...(below ? { top: at.y + 18 } : { bottom: view.height - at.y + 18 }),
        transformOrigin: `${at.x - left}px ${below ? '0%' : '100%'}`,
      }}
      className={cn(
        'pointer-events-auto absolute z-30 flex flex-col gap-3 rounded-2xl p-4',
        glass,
        'bg-surface/85',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">
          {t.link.label}
          {link.cross && <span className="ml-2 normal-case text-accent">{t.link.cross}</span>}
        </span>
        <IconButton icon={X} label={t.close} onClick={onClose} />
      </div>
      <div className="flex flex-col gap-1.5">
        {[link.a, link.b].map((node) => {
          const project = projects.get(node.projectId);
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => onSelectCard(node.id)}
              aria-label={t.card.openCard(node.label)}
              className="focus-ring no-callout flex min-h-11 items-center gap-3 rounded-xl bg-surface-sunken/70 px-3 py-2 text-left"
            >
              <ProjectDot color={node.color} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-fg">{node.label}</span>
                {project && (
                  <span className="truncate text-xs text-fg-secondary">{project.name}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {link.kind === 'manual' ? (
        <p className="text-sm text-fg-secondary">{t.link.manual}</p>
      ) : (
        <div className="flex items-center gap-3" data-testid="brain-link-similarity">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
            <motion.span
              className="block h-full rounded-full bg-accent"
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={spring.soft}
            />
          </span>
          <span className="text-sm font-medium text-fg tabular-nums">
            {t.link.similarity(percent)}
          </span>
        </div>
      )}
      {pair?.explanation ? (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.soft}
          className="rounded-xl bg-accent-soft px-3 py-2.5 text-sm text-fg"
          data-testid="brain-link-explanation"
        >
          <Sparkles size={14} aria-hidden className="mr-1.5 -mt-0.5 inline text-accent" />
          {pair.explanation}
        </motion.p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Button
            variant="secondary"
            icon={state.loading ? undefined : Sparkles}
            disabled={unavailable !== null || state.loading || !pair?.a || !pair.b}
            aria-describedby={unavailable ? 'brain-link-why-hint' : undefined}
            onClick={() => void explain()}
            data-testid="brain-link-why"
          >
            {state.loading ? (
              <>
                <Spinner size={16} /> {t.link.explaining}
              </>
            ) : (
              t.link.why
            )}
          </Button>
          {unavailable && (
            <p id="brain-link-why-hint" className="text-xs text-fg-secondary">
              {unavailable}
            </p>
          )}
          {state.error && (
            <p className="text-xs text-danger" role="alert">
              {de.settings.aiErrors[state.error]}
            </p>
          )}
        </div>
      )}
      {link.kind === 'manual' && (
        <Button
          variant="ghost"
          icon={Trash2}
          onClick={() => void remove()}
          data-testid="brain-link-remove"
        >
          {t.link.remove}
        </Button>
      )}
    </motion.div>
  );
}

// Add a manual link --------------------------------------------------------------------------

export interface PickerCard {
  id: string;
  front: string;
  back: string;
  color: ProjectColor;
  projectName: string;
}

export interface LinkPickerProps {
  source: PickerCard | null;
  cards: readonly PickerCard[];
  /** Cards already linked to the source. */
  linked: ReadonlySet<string>;
  onClose: () => void;
  onLinked: (targetId: string) => void;
}

export function LinkPicker({ source, cards, linked, onClose, onLinked }: LinkPickerProps) {
  const [query, setQuery] = useState('');
  const results = source
    ? searchCards(
        cards.filter((card) => card.id !== source.id),
        query,
        12,
      )
    : [];

  const pick = async (targetId: string) => {
    if (!source) return;
    try {
      await linksRepo.addManual(source.id, targetId);
      toast.success(t.picker.added);
      setQuery('');
      onLinked(targetId);
    } catch (error: unknown) {
      console.error('Adding a manual link failed', error);
      toast.error(t.picker.failed);
    }
  };

  return (
    <Modal
      open={source !== null}
      onClose={() => {
        setQuery('');
        onClose();
      }}
      title={t.picker.title}
      description={source ? t.picker.description(source.front) : undefined}
    >
      <div className="flex flex-col gap-3" data-testid="brain-link-picker">
        <Input
          label={t.picker.search}
          placeholder={t.picker.placeholder}
          value={query}
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            const first = results.find((card) => !linked.has(card.id));
            if (event.key === 'Enter' && first && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void pick(first.id);
            }
          }}
        />
        {query.trim() === '' ? (
          <p className="text-sm text-fg-secondary">{t.picker.hint}</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-fg-secondary">{t.picker.empty}</p>
        ) : (
          <ul className="flex max-h-[min(50dvh,24rem)] flex-col gap-1.5 overflow-y-auto">
            {results.map((card) => {
              const done = linked.has(card.id);
              return (
                <li key={card.id}>
                  <button
                    type="button"
                    disabled={done}
                    onClick={() => void pick(card.id)}
                    className="focus-ring no-callout flex min-h-12 w-full items-center gap-3 rounded-xl border border-line bg-surface-sunken/60 px-3 py-2 text-left disabled:opacity-55 [@media(hover:hover)]:enabled:hover:border-line-strong"
                  >
                    <ProjectDot color={card.color} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium text-fg">{card.front}</span>
                      <span className="truncate text-xs text-fg-secondary">
                        {card.projectName} · {card.back}
                      </span>
                    </span>
                    {done && <span className="text-xs text-fg-secondary">{t.picker.linked}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

// Hover preview (mouse/trackpad) --------------------------------------------------------------

export interface HoverPreviewProps {
  at: { x: number; y: number };
  front: string;
  back: string;
  projectName: string;
  color: ProjectColor;
  level: string;
}

export function HoverPreview({ at, front, back, projectName, color, level }: HoverPreviewProps) {
  return (
    <motion.div
      aria-hidden
      data-testid="brain-hover"
      initial={{ opacity: 0, y: 4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={spring.snappy}
      style={{ left: at.x + 14, top: at.y + 14 }}
      className={cn(
        'pointer-events-none absolute z-10 flex w-64 flex-col gap-1 rounded-xl px-3.5 py-2.5',
        glass,
        'bg-surface/85',
      )}
    >
      <span className="text-sm font-semibold text-fg">{front}</span>
      <span className="line-clamp-3 text-xs text-fg-secondary">{back}</span>
      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted">
        <ProjectDot color={color} className="size-2" />
        {projectName} · {level}
      </span>
    </motion.div>
  );
}
