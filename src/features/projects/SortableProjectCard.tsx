import { Link } from 'react-router';
import { motion } from 'motion/react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MoreHorizontal } from 'lucide-react';
import { cn, IconButton, type MenuAnchor } from '@/components/ui';
import type { ProjectSummary } from '@/data/types';
import { de } from '@/i18n/de';
import { spring, TAP_SCALE } from '@/styles/motion';
import { studyLayoutId, useStudyLaunch } from '@/features/study/studyLaunch';
import { ProjectCardView } from './ProjectCard';

const t = de.pages.projects;

export interface SortableProjectCardProps {
  project: ProjectSummary;
  /** False while sorting, so motion's layout animation does not fight dnd-kit's transforms. */
  layoutEnabled: boolean;
  onMenu: (project: ProjectSummary, anchor: MenuAnchor) => void;
  onStudy: (project: ProjectSummary) => void;
}

export function SortableProjectCard({
  project,
  layoutEnabled,
  onMenu,
  onStudy,
}: SortableProjectCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  });
  // Re-renders the study button when the launch starts, so the shared layout has its position.
  const launching = useStudyLaunch((s) => s.stage !== 'idle' && s.projectId === project.id);

  return (
    <motion.li
      layout={layoutEnabled ? 'position' : false}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={spring.default}
      className="list-none"
      data-testid="project-card"
      data-project-id={project.id}
    >
      <div
        ref={setNodeRef}
        style={{
          transform: CSS.Translate.toString(transform),
          transition,
          zIndex: isDragging ? 20 : undefined,
          position: 'relative',
        }}
        {...attributes}
        {...listeners}
        aria-label={project.name}
        aria-roledescription={t.sortableRole}
        title={t.reorderHint}
        onContextMenu={(event) => {
          event.preventDefault();
          onMenu(project, { x: event.clientX, y: event.clientY });
        }}
        className="focus-ring no-callout group h-full touch-manipulation rounded-xl transition-[translate] duration-200 hover:-translate-y-1"
      >
        <motion.div
          className="h-full"
          whileTap={{ scale: TAP_SCALE }}
          animate={{ scale: isDragging ? 1.03 : 1 }}
          transition={spring.snappy}
        >
          <ProjectCardView
            project={project}
            lifted={isDragging}
            launching={launching}
            onStudy={() => onStudy(project)}
            studyLayoutId={layoutEnabled && !isDragging ? studyLayoutId(project.id) : undefined}
            className={cn('group-hover:shadow-[0_24px_50px_-24px_var(--project)]')}
            overlay={
              <Link
                to={`/projects/${project.id}`}
                aria-label={t.open(project.name)}
                draggable={false}
                className="focus-ring absolute inset-0 rounded-xl"
              />
            }
            menu={
              <IconButton
                icon={MoreHorizontal}
                label={t.menuLabel(project.name)}
                aria-haspopup="menu"
                onClick={(event) => onMenu(project, event.currentTarget.getBoundingClientRect())}
                // Keep taps on the button from starting a drag.
                onTouchStart={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
              />
            }
          />
        </motion.div>
      </div>
    </motion.li>
  );
}
