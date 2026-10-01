import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { Flame, Layers, Play, Zap } from 'lucide-react';
import { Button, cn, EmptyState, ProjectAvatar, Skeleton, Surface } from '@/components/ui';
import { Page } from '@/app/shell/Page';
import { parseAnswers } from '@/core/cards';
import type { ActivityStats, StatsOverview } from '@/data/repositories';
import { CROSS_PROJECT_ID } from '@/data/types';
import {
  crossStudyPath,
  studyLayoutId,
  useLaunchStudy,
  useStudyLaunch,
} from '@/features/study/studyLaunch';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';
import { ActivityHeatmap } from './ActivityHeatmap';
import { useActivity, useStatsOverview } from './hooks';
import { MasteryBar } from './MasteryBar';
import { MasteryDot } from './MasteryDot';
import { MASTERY_BG, MASTERY_ORDER } from './masteryUi';

const t = de.pages.stats;
const m = de.mastery;

/** Sections fade and rise in one after another. */
const section = (index: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { ...spring.soft, delay: index * 0.06 },
});

export function StatsPage() {
  const overview = useStatsOverview();
  const activity = useActivity();
  const navigate = useNavigate();

  if (overview === undefined || activity === undefined) {
    return (
      <Page title={t.title}>
        <div className="flex flex-col gap-4" aria-busy>
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
          <span className="sr-only">{t.loading}</span>
        </div>
      </Page>
    );
  }

  if (overview.cardCount === 0 && activity.byDay.size === 0) {
    return (
      <Page title={t.title}>
        <EmptyState
          title={t.emptyTitle}
          text={t.emptyText}
          action={
            <Button variant="secondary" onClick={() => void navigate('/projects')}>
              {t.emptyAction}
            </Button>
          }
        />
      </Page>
    );
  }

  return (
    <Page title={t.title}>
      <div className="flex flex-col gap-5" data-testid="stats-page">
        <Kpis overview={overview} activity={activity} />
        <motion.div {...section(2)}>
          <Surface>
            <SectionHeader title={t.activity.title} subtitle={t.activity.subtitle} />
            <ActivityHeatmap byDay={activity.byDay} today={activity.today} />
          </Surface>
        </motion.div>
        <div className="grid grid-cols-1 gap-5 wide:grid-cols-2 wide:items-start">
          <motion.div {...section(3)}>
            <ProjectsSection overview={overview} />
          </motion.div>
          <motion.div {...section(4)}>
            <HardestSection overview={overview} />
          </motion.div>
        </div>
      </div>
    </Page>
  );
}

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
        {subtitle && <p className="text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'accent',
  testId,
}: {
  icon: typeof Layers;
  label: string;
  value: string;
  hint?: string;
  tone?: 'accent' | 'warning' | 'success';
  testId: string;
}) {
  const tones = {
    accent: 'bg-accent-soft text-accent',
    warning: 'bg-warning-soft text-warning',
    success: 'bg-success-soft text-success',
  } as const;
  return (
    <Surface padding="sm" className="flex items-center gap-4">
      <span
        className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-full',
          tones[tone],
        )}
      >
        <Icon size={22} aria-hidden />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-sm text-fg-secondary">{label}</span>
        <span
          className="text-2xl font-semibold tracking-tight text-fg tabular-nums"
          data-testid={testId}
        >
          {value}
        </span>
        {hint && <span className="text-xs text-fg-muted">{hint}</span>}
      </div>
    </Surface>
  );
}

function Kpis({ overview, activity }: { overview: StatsOverview; activity: ActivityStats }) {
  return (
    <section aria-label={t.kpis.label} className="flex flex-col gap-3">
      <motion.div {...section(0)} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile
          icon={Layers}
          label={t.kpis.cards}
          value={String(overview.cardCount)}
          testId="kpi-cards"
        />
        <Tile
          icon={Zap}
          label={t.kpis.answersToday}
          value={String(activity.answersToday)}
          tone="success"
          testId="kpi-today"
        />
        <Tile
          icon={Flame}
          label={t.kpis.streak}
          value={t.kpis.streakValue(activity.streak)}
          hint={t.kpis.streakHint(activity.streak)}
          tone="warning"
          testId="kpi-streak"
        />
      </motion.div>
      <motion.div {...section(1)}>
        <Surface padding="sm" className="flex flex-col gap-4 px-5">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[...MASTERY_ORDER].reverse().map((level) => (
              <li key={level} className="flex items-center gap-3" data-testid={`kpi-${level}`}>
                <span
                  className={cn('size-3 shrink-0 rounded-full', MASTERY_BG[level])}
                  aria-hidden
                />
                <span className="flex flex-col">
                  <span className="text-xl font-semibold text-fg tabular-nums">
                    {overview.counts[level]}
                  </span>
                  <span className="text-sm text-fg-secondary">{m.levels[level]}</span>
                </span>
              </li>
            ))}
          </ul>
          <MasteryBar counts={overview.counts} delay={0.15} />
        </Surface>
      </motion.div>
    </section>
  );
}

function ProjectsSection({ overview }: { overview: StatsOverview }) {
  const navigate = useNavigate();
  return (
    <Surface>
      <SectionHeader title={t.projects.title} />
      {overview.projects.length === 0 ? (
        <p className="text-base text-fg-secondary">{t.projects.empty}</p>
      ) : (
        <ul className="flex flex-col gap-1" data-testid="stats-projects">
          {overview.projects.map(({ project, cardCount, counts }, index) => (
            <li key={project.id}>
              <button
                type="button"
                onClick={() => void navigate(`/projects/${project.id}`)}
                className="focus-ring no-callout -mx-2 flex w-[calc(100%+1rem)] flex-col gap-2 rounded-lg px-2 py-3 text-left transition-colors hover:bg-surface-sunken"
              >
                <span className="flex items-center gap-3">
                  <ProjectAvatar color={project.color} icon={project.icon} size={32} />
                  <span className="min-w-0 flex-1 truncate text-base font-semibold text-fg">
                    {project.name}
                  </span>
                  <span className="shrink-0 text-sm text-fg-muted tabular-nums">
                    {cardCount === 0
                      ? t.projects.cards(0)
                      : t.projects.solidShare(Math.round((counts.solid / cardCount) * 100))}
                  </span>
                </span>
                <MasteryBar counts={counts} size="sm" delay={0.25 + index * 0.08} />
                <span className="text-xs text-fg-muted">
                  {[
                    t.projects.cards(cardCount),
                    ...MASTERY_ORDER.filter((level) => counts[level] > 0).map((level) =>
                      m.segment(m.levels[level], counts[level]),
                    ),
                  ].join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}

function HardestSection({ overview }: { overview: StatsOverview }) {
  const launchStudy = useLaunchStudy();
  // Re-renders the button when the launch starts, so the shared layout has its position.
  const launching = useStudyLaunch((s) => s.stage !== 'idle' && s.projectId === CROSS_PROJECT_ID);
  const cards = overview.hardest;
  const action =
    cards.length > 0 ? (
      <Button
        icon={Play}
        layoutId={studyLayoutId(CROSS_PROJECT_ID)}
        data-launching={launching || undefined}
        style={{ borderRadius: 28 }}
        onClick={() =>
          launchStudy(
            { id: CROSS_PROJECT_ID, color: 'violet' },
            '/stats',
            crossStudyPath(cards.map(({ card }) => card.id)),
          )
        }
      >
        {t.hardest.study}
      </Button>
    ) : undefined;

  return (
    <Surface>
      <SectionHeader title={t.hardest.title} subtitle={t.hardest.subtitle} action={action} />
      {cards.length === 0 ? (
        <p className="text-base text-fg-secondary">{t.hardest.empty}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line" data-testid="stats-hardest">
          {cards.map(({ card, mastery, project }) => (
            <li key={card.id} className="flex items-center gap-2 py-2">
              <MasteryDot mastery={mastery} className="-ml-3" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-base font-semibold text-fg">{card.front}</span>
                <span className="truncate text-sm text-fg-secondary">
                  {parseAnswers(card.back).join(' · ')}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-sm font-semibold text-fg tabular-nums">
                  {Math.round(mastery.score * 100)} %
                </span>
                <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                  <ProjectAvatar color={project.color} icon={project.icon} size={18} />
                  <span className="max-w-32 truncate">{project.name}</span>
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Surface>
  );
}
