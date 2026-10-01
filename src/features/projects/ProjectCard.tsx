import type { ReactNode } from 'react';
import { Layers, Play } from 'lucide-react';
import { Badge, Button, cn, projectColor, ProjectAvatar } from '@/components/ui';
import { formatRelativeTime } from '@/core/relativeTime';
import type { ProjectColor } from '@/data/types';
import { de } from '@/i18n/de';

const t = de.pages.projects;

export interface ProjectCardData {
  name: string;
  description?: string;
  color: ProjectColor;
  icon?: string;
  archived: boolean;
  cardCount: number;
  lastStudiedAt?: string;
  /** Cards due for review today (spaced repetition). */
  dueCount?: number;
}

export interface ProjectCardViewProps {
  project: ProjectCardData;
  /** Top-right slot, e.g. the "⋯" menu button. */
  menu?: ReactNode;
  onStudy?: () => void;
  /** Shared layoutId of the study button (expands into the study surface). */
  studyLayoutId?: string;
  /** The study transition of this project runs (re-renders the button for the shared layout). */
  launching?: boolean;
  /** Visual state while dragging. */
  lifted?: boolean;
  /** Full-card element below the buttons (e.g. the link that opens the project). */
  overlay?: ReactNode;
  className?: string;
}

/** Visual project card (grid item and live preview in the dialog). */
export function ProjectCardView({
  project,
  menu,
  onStudy,
  studyLayoutId,
  launching = false,
  lifted = false,
  overlay,
  className,
}: ProjectCardViewProps) {
  const color = projectColor(project.color);
  const soft = projectColor(project.color, true);
  return (
    <div
      className={cn(
        'relative flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card transition-[box-shadow,translate] duration-200',
        lifted && 'shadow-float',
        project.archived && 'opacity-70',
        className,
      )}
      style={{ ['--project' as string]: color, ['--project-soft' as string]: soft }}
    >
      {/* Soft color accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-28"
        style={{ background: `linear-gradient(160deg, ${soft}, transparent 80%)` }}
      />
      {overlay}
      <div className="pointer-events-none relative flex items-start justify-between gap-2 p-5 pb-3">
        <ProjectAvatar
          color={project.color}
          icon={project.icon}
          size={52}
          className="shadow-soft"
        />
        <div className="pointer-events-auto relative z-10 -mt-1 -mr-2 flex items-center gap-1">
          {project.archived && <Badge>{t.archivedBadge}</Badge>}
          {menu}
        </div>
      </div>
      <div className="pointer-events-none relative flex flex-1 flex-col gap-1 px-5">
        <h2 className="line-clamp-2 text-lg font-semibold tracking-tight break-words text-fg">
          {project.name || t.dialog.previewName}
        </h2>
        {project.description && (
          <p className="line-clamp-2 text-sm break-words text-fg-secondary">
            {project.description}
          </p>
        )}
      </div>
      <div className="pointer-events-none relative mt-4 flex flex-wrap items-end justify-between gap-3 px-5 pb-5">
        <div className="flex min-w-32 flex-1 flex-col gap-0.5 text-sm text-fg-muted">
          <span className="flex items-center gap-1.5 font-medium text-fg-secondary">
            <Layers size={15} aria-hidden />
            {t.cardCount(project.cardCount)}
            {project.dueCount !== undefined && project.dueCount > 0 && (
              <span
                className="ml-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                style={{ background: soft, color }}
                data-testid="project-due"
              >
                {t.due(project.dueCount)}
              </span>
            )}
          </span>
          <span className="truncate">
            {project.lastStudiedAt
              ? t.lastStudied(formatRelativeTime(project.lastStudiedAt))
              : t.neverStudied}
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          icon={Play}
          layoutId={studyLayoutId}
          data-launching={launching || undefined}
          onClick={onStudy}
          tabIndex={onStudy ? undefined : -1}
          // Taps on the button must not start dragging the card.
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          className="pointer-events-auto relative z-10 border-transparent shadow-none hover:border-transparent hover:brightness-110"
          style={{ background: soft, color, borderRadius: 22 }}
        >
          {t.study}
        </Button>
      </div>
    </div>
  );
}
