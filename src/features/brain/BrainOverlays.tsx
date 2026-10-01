import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Expand,
  FlaskConical,
  Info,
  Maximize,
  Minimize,
  Minus,
  Plus,
  Shuffle,
  X,
} from 'lucide-react';
import { ActionMenu, cn, IconButton, projectColor, type ActionMenuItem } from '@/components/ui';
import { MASTERY_LEVELS } from '@/core/mastery';
import { MASTERY_STYLE } from '@/core/brain/graph';
import { SYNTHETIC_SIZES } from '@/core/brain/synthetic';
import type { Project } from '@/data/types';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';
import { useBrainView } from './brainViewStore';

const t = de.pages.brain.graph;

/** Frosted glass for everything that floats above the canvas. */
export const glass =
  'border border-line bg-surface/70 shadow-float backdrop-blur-xl backdrop-saturate-150';

export interface BrainControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onRearrange: () => void;
  devMode: boolean;
  syntheticSize: number | null;
  onSynthetic: (nodes: number | null) => void;
}

/** Floating control bar, bottom center. */
export function BrainControls({
  onZoomIn,
  onZoomOut,
  onFit,
  onRearrange,
  devMode,
  syntheticSize,
  onSynthetic,
}: BrainControlsProps) {
  const fullscreen = useBrainView((s) => s.fullscreen);
  const setFullscreen = useBrainView((s) => s.setFullscreen);
  const [devAnchor, setDevAnchor] = useState<DOMRect | null>(null);
  const devItems: ActionMenuItem[] = [
    ...SYNTHETIC_SIZES.map((size) => ({
      id: `synthetic-${size.nodes}`,
      label: t.syntheticOption(size.nodes, size.edges),
      disabled: syntheticSize === size.nodes,
      onSelect: () => onSynthetic(size.nodes),
    })),
    {
      id: 'real',
      label: t.realData,
      disabled: syntheticSize === null,
      onSelect: () => onSynthetic(null),
    },
  ];

  return (
    <div
      role="toolbar"
      aria-label={t.controls}
      data-testid="brain-controls"
      className={cn('pointer-events-auto flex items-center gap-1 rounded-full p-1.5', glass)}
    >
      <IconButton icon={Minus} label={t.zoomOut} onClick={onZoomOut} />
      <IconButton icon={Plus} label={t.zoomIn} onClick={onZoomIn} />
      <IconButton icon={Expand} label={t.fit} onClick={onFit} />
      <span aria-hidden className="mx-1 h-6 w-px bg-line-strong" />
      <IconButton icon={Shuffle} label={t.rearrange} onClick={onRearrange} />
      <IconButton
        icon={fullscreen ? Minimize : Maximize}
        label={fullscreen ? t.exitFullscreen : t.fullscreen}
        active={fullscreen}
        onClick={() => setFullscreen(!fullscreen)}
      />
      {devMode && (
        <>
          <IconButton
            icon={FlaskConical}
            label={t.synthetic}
            active={syntheticSize !== null}
            aria-haspopup="menu"
            aria-expanded={devAnchor !== null}
            onClick={(event) => setDevAnchor(event.currentTarget.getBoundingClientRect())}
          />
          <ActionMenu
            open={devAnchor !== null}
            anchor={devAnchor}
            onClose={() => setDevAnchor(null)}
            items={devItems}
            label={t.synthetic}
          />
        </>
      )}
    </div>
  );
}

function Swatch({ color, alpha, glow }: { color: string; alpha: number; glow: number }) {
  return (
    <span
      aria-hidden
      className="size-3 shrink-0 rounded-full"
      style={{
        background: color,
        opacity: alpha,
        boxShadow: glow > 0 ? `0 0 ${4 + glow * 10}px ${glow * 3}px ${color}` : undefined,
      }}
    />
  );
}

function LinkSample({ variant }: { variant: 'intra' | 'cross' | 'manual' }) {
  return (
    <svg width="28" height="10" viewBox="0 0 28 10" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="brain-legend-cross" x1="0" x2="1">
          <stop offset="0" stopColor="var(--project-rose)" />
          <stop offset="1" stopColor="var(--project-sky)" />
        </linearGradient>
      </defs>
      {variant === 'cross' ? (
        <path d="M2 8 Q14 0 26 8" fill="none" stroke="url(#brain-legend-cross)" strokeWidth="2" />
      ) : (
        <line
          x1="2"
          y1="5"
          x2="26"
          y2="5"
          stroke={variant === 'manual' ? 'var(--accent)' : 'var(--fg-muted)'}
          strokeWidth={variant === 'manual' ? 2 : 1.5}
          strokeDasharray={variant === 'manual' ? '4 3' : undefined}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/** Collapsible legend, bottom left. */
export function BrainLegend({ projects }: { projects: readonly Project[] }) {
  const open = useBrainView((s) => s.legendOpen);
  const setOpen = useBrainView((s) => s.setLegendOpen);
  const levels = de.mastery.levels;
  return (
    <div className="pointer-events-auto flex flex-col items-start gap-2">
      <AnimatePresence initial={false}>
        {open && (
          <motion.section
            key="legend"
            id="brain-legend"
            aria-label={t.legend}
            data-testid="brain-legend"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={spring.default}
            className={cn(
              'flex max-h-[min(60dvh,30rem)] w-64 origin-bottom-left flex-col gap-4 overflow-y-auto rounded-xl p-4 text-sm text-fg',
              glass,
            )}
          >
            <div className="flex flex-col gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
                {t.legendMastery}
              </h2>
              {MASTERY_LEVELS.map((level) => (
                <span key={level} className="flex items-center gap-2.5">
                  <Swatch
                    color="var(--accent)"
                    alpha={MASTERY_STYLE[level].core}
                    glow={MASTERY_STYLE[level].glow}
                  />
                  {levels[level]}
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
                {t.legendLinks}
              </h2>
              <span className="flex items-center gap-2.5">
                <LinkSample variant="intra" />
                {t.linkIntra}
              </span>
              <span className="flex items-center gap-2.5">
                <LinkSample variant="cross" />
                {t.linkCross}
              </span>
              <span className="flex items-center gap-2.5">
                <LinkSample variant="manual" />
                {t.linkManual}
              </span>
            </div>
            {projects.length > 0 && (
              <div className="flex flex-col gap-2">
                <h2 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
                  {t.legendProjects}
                </h2>
                {projects.map((project) => (
                  <span key={project.id} className="flex min-w-0 items-center gap-2.5">
                    <Swatch color={projectColor(project.color)} alpha={1} glow={0.4} />
                    <span className="truncate">{project.name}</span>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-fg-secondary">{t.hint}</p>
          </motion.section>
        )}
      </AnimatePresence>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="brain-legend"
        onClick={() => setOpen(!open)}
        className={cn(
          'focus-ring no-callout flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium text-fg',
          glass,
        )}
      >
        {open ? <X size={18} aria-hidden /> : <Info size={18} aria-hidden />}
        {t.legend}
      </button>
    </div>
  );
}
