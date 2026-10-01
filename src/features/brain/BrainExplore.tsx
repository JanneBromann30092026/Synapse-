import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Button, cn, IconButton, projectColor, Slider, Toggle } from '@/components/ui';
import {
  activeFilterCount,
  DEFAULT_BRAIN_FILTER,
  MIN_SIMILARITY_RANGE,
  searchCards,
  type BrainFilter,
} from '@/core/brain/interaction';
import { MASTERY_LEVELS, type MasteryLevel } from '@/core/mastery';
import type { Project, ProjectColor } from '@/data/types';
import { MASTERY_BG } from '@/features/stats/masteryUi';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';
import { glass } from './BrainOverlays';
import { useBrainView } from './brainViewStore';

const t = de.pages.brain.explore;

/** Delay before the hits of a query pulse in the graph. */
const PULSE_DEBOUNCE_MS = 280;
const SEARCH_LIMIT = 8;

export interface SearchCard {
  id: string;
  front: string;
  back: string;
  color: ProjectColor;
  projectName: string;
}

export interface BrainSearchProps {
  cards: readonly SearchCard[];
  onPick: (id: string) => void;
  /** Hits of the current query (they pulse in the graph). */
  onHits: (ids: string[]) => void;
}

/** Search pill (top left): live search over all visible cards, ⌘K on hardware keyboards. */
export function BrainSearch({ cards, onPick, onHits }: BrainSearchProps) {
  const open = useBrainView((s) => s.searchOpen);
  const setOpen = useBrainView((s) => s.setSearchOpen);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = searchCards(cards, query, SEARCH_LIMIT);

  const latestHits = useRef(onHits);
  useEffect(() => {
    latestHits.current = onHits;
  });
  const resultKey = results.map((card) => card.id).join(',');
  useEffect(() => {
    if (!resultKey) return;
    const timer = setTimeout(() => latestHits.current(resultKey.split(',')), PULSE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [resultKey]);

  const close = () => {
    setOpen(false);
    setQuery('');
    setActive(0);
  };

  const pick = (id: string) => {
    close();
    onPick(id);
  };

  return (
    <div className="pointer-events-auto relative flex flex-col gap-2">
      <motion.div
        layout
        transition={spring.default}
        className={cn(
          'flex min-h-11 items-center gap-2 rounded-full pr-1.5 pl-3.5 text-sm',
          glass,
          open ? 'w-[min(22rem,calc(100vw-2rem))]' : 'w-auto',
        )}
      >
        {open ? (
          <>
            <Search size={18} aria-hidden className="shrink-0 text-fg-secondary" />
            <input
              ref={inputRef}
              autoFocus
              type="search"
              role="combobox"
              aria-label={t.searchLabel}
              aria-expanded={results.length > 0}
              aria-controls={listId}
              aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
              placeholder={t.searchPlaceholder}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              data-testid="brain-search-input"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setActive((index) => Math.min(results.length - 1, index + 1));
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActive((index) => Math.max(0, index - 1));
                } else if (event.key === 'Enter') {
                  const card = results[active];
                  if (card) {
                    event.preventDefault();
                    pick(card.id);
                  }
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  close();
                }
              }}
              className="min-w-0 flex-1 bg-transparent py-2 text-base text-fg outline-none placeholder:text-fg-muted [&::-webkit-search-cancel-button]:hidden"
            />
            <IconButton icon={X} label={t.close} onClick={close} />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            data-testid="brain-search"
            className="focus-ring no-callout -ml-1 flex min-h-11 items-center gap-2 rounded-full pr-2.5 pl-1 text-fg"
          >
            <Search size={18} aria-hidden className="text-fg-secondary" />
            <span className="font-medium">{t.search}</span>
            <kbd className="rounded-md border border-line px-1.5 py-0.5 font-sans text-xs text-fg-muted">
              {t.searchShortcut}
            </kbd>
          </button>
        )}
      </motion.div>
      <AnimatePresence>
        {open && query.trim() !== '' && (
          <motion.ul
            key="results"
            id={listId}
            role="listbox"
            aria-label={t.searchLabel}
            data-testid="brain-search-results"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={spring.default}
            className={cn(
              'absolute top-full left-0 z-30 mt-2 flex max-h-[min(55dvh,26rem)] w-[min(22rem,calc(100vw-2rem))] origin-top-left flex-col gap-0.5 *:shrink-0 overflow-y-auto rounded-2xl p-1.5',
              glass,
              'bg-surface/85',
            )}
          >
            {results.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-fg-secondary">{t.searchEmpty}</li>
            ) : (
              results.map((card, index) => (
                <li
                  key={card.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick(card.id)}
                    className={cn(
                      'no-callout flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left',
                      index === active
                        ? 'bg-accent-soft'
                        : '[@media(hover:hover)]:hover:bg-surface-sunken',
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: projectColor(card.color) }}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium text-fg">{card.front}</span>
                      <span className="truncate text-xs text-fg-secondary">
                        {card.projectName} · {card.back}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export interface BrainFilterProps {
  filter: BrainFilter;
  projects: readonly Project[];
  onChange: (filter: BrainFilter) => void;
}

function Chip({
  selected,
  onClick,
  children,
  testId,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'focus-ring no-callout flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors',
        selected
          ? 'border-transparent bg-accent-soft text-fg'
          : 'border-line text-fg-secondary line-through decoration-fg-muted/60',
      )}
    >
      {children}
    </button>
  );
}

/** Collapsible filter (top right): projects, link types, similarity, mastery. Saved. */
export function BrainFilterPanel({ filter, projects, onChange }: BrainFilterProps) {
  const open = useBrainView((s) => s.filterOpen);
  const setOpen = useBrainView((s) => s.setFilterOpen);
  const count = activeFilterCount(filter);
  const levels = de.mastery.levels;
  const toggleProject = (id: string) =>
    onChange({
      ...filter,
      hiddenProjects: filter.hiddenProjects.includes(id)
        ? filter.hiddenProjects.filter((other) => other !== id)
        : [...filter.hiddenProjects, id],
    });
  const toggleLevel = (level: MasteryLevel) =>
    onChange({
      ...filter,
      levels: filter.levels.includes(level)
        ? filter.levels.filter((other) => other !== level)
        : MASTERY_LEVELS.filter((other) => other === level || filter.levels.includes(other)),
    });

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="brain-filter"
        onClick={() => setOpen(!open)}
        data-testid="brain-filter-toggle"
        className={cn(
          'focus-ring no-callout flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium text-fg',
          glass,
        )}
      >
        {open ? <X size={18} aria-hidden /> : <SlidersHorizontal size={18} aria-hidden />}
        {t.filter}
        <AnimatePresence>
          {count > 0 && (
            <motion.span
              key="count"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={spring.snappy}
              aria-label={t.filterCount(count)}
              data-testid="brain-filter-count"
              className="flex size-5 items-center justify-center rounded-full bg-accent text-xs text-on-accent tabular-nums"
            >
              {count}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.section
            key="filter"
            id="brain-filter"
            aria-label={t.filterTitle}
            data-testid="brain-filter"
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={spring.default}
            className={cn(
              'flex max-h-[min(70dvh,36rem)] w-[min(21rem,calc(100vw-2rem))] origin-top-right flex-col gap-4 *:shrink-0 overflow-y-auto overscroll-contain rounded-2xl p-4 text-sm text-fg',
              glass,
              'bg-surface/95',
            )}
          >
            {projects.length > 0 && (
              <div className="flex flex-col gap-2">
                <h2 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
                  {t.filterProjects}
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {projects.map((project) => (
                    <Chip
                      key={project.id}
                      selected={!filter.hiddenProjects.includes(project.id)}
                      onClick={() => toggleProject(project.id)}
                      testId="brain-filter-project"
                    >
                      <span
                        aria-hidden
                        className="size-2.5 rounded-full"
                        style={{ background: projectColor(project.color) }}
                      />
                      <span className="max-w-40 truncate">{project.name}</span>
                    </Chip>
                  ))}
                </div>
              </div>
            )}
            <Toggle
              label={t.filterCrossOnly}
              checked={filter.crossOnly}
              onChange={(crossOnly) => onChange({ ...filter, crossOnly })}
            />
            <div className="flex flex-col gap-1">
              <Slider
                label={t.filterMinSimilarity}
                value={filter.minSimilarity}
                min={MIN_SIMILARITY_RANGE.min}
                max={MIN_SIMILARITY_RANGE.max}
                step={MIN_SIMILARITY_RANGE.step}
                format={(value) =>
                  value <= MIN_SIMILARITY_RANGE.min ? t.filterAll : t.percent(value)
                }
                onChange={(minSimilarity) => onChange({ ...filter, minSimilarity })}
              />
              <p className="text-xs text-fg-secondary">{t.filterMinSimilarityHint}</p>
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
                {t.filterLevels}
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {MASTERY_LEVELS.map((level) => (
                  <Chip
                    key={level}
                    selected={filter.levels.includes(level)}
                    onClick={() => toggleLevel(level)}
                    testId="brain-filter-level"
                  >
                    <span aria-hidden className={cn('size-2.5 rounded-full', MASTERY_BG[level])} />
                    {levels[level]}
                  </Chip>
                ))}
              </div>
            </div>
            <Toggle
              label={t.filterHideUnlearned}
              description={t.filterHideUnlearnedHint}
              checked={filter.hideUnlearned}
              onChange={(hideUnlearned) => onChange({ ...filter, hideUnlearned })}
            />
            <Button
              variant="ghost"
              disabled={count === 0}
              onClick={() => onChange(DEFAULT_BRAIN_FILTER)}
            >
              {t.filterReset}
            </Button>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
