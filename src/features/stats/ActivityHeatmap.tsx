import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/components/ui';
import { heatmapWeeks, type HeatmapCell } from '@/core/activity';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';

const t = de.pages.stats.activity;

const LEVEL_BG = ['bg-line', 'bg-accent/25', 'bg-accent/45', 'bg-accent/70', 'bg-accent'] as const;

const dateFormat = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const monthFormat = new Intl.DateTimeFormat('de-DE', { month: 'short', timeZone: 'UTC' });

/** Day keys are calendar days; format them in UTC so the device zone cannot shift them. */
const asDate = (key: string) => new Date(`${key}T00:00:00Z`);

function formatDay(key: string): string {
  return dateFormat.format(asDate(key));
}

export interface ActivityHeatmapProps {
  byDay: ReadonlyMap<string, number>;
  today: string;
  weeks?: number;
}

/** GitHub-style grid: 16 weeks (columns, Monday on top), intensity in the accent color. */
export function ActivityHeatmap({ byDay, today, weeks = 16 }: ActivityHeatmapProps) {
  const columns = useMemo(() => heatmapWeeks(byDay, today, weeks), [byDay, today, weeks]);
  const [selected, setSelected] = useState<HeatmapCell | null>(null);
  const current = selected ? columns.flat().find((cell) => cell.date === selected.date) : null;

  // Month label above the first column that starts in a new month.
  const months = columns.map((column, index) => {
    const first = column[0]?.date ?? '';
    const previous = columns[index - 1]?.[0]?.date ?? '';
    return index === 0 || first.slice(0, 7) !== previous.slice(0, 7)
      ? monthFormat.format(asDate(first)).replace('.', '')
      : '';
  });

  return (
    <div className="flex flex-col gap-3">
      <div
        className="grid max-w-[44rem] gap-1 sm:gap-1.5"
        style={{ gridTemplateColumns: `auto repeat(${weeks}, minmax(0, 1fr))` }}
        data-testid="activity-heatmap"
      >
        <span />
        {months.map((label, index) => (
          <span
            key={index}
            aria-hidden
            className="overflow-visible text-xs whitespace-nowrap text-fg-muted"
          >
            {label}
          </span>
        ))}
        {t.weekdays.map((weekday, row) => (
          <span
            key={weekday}
            aria-hidden
            className="flex items-center pr-1 text-xs text-fg-muted"
            style={{ gridColumn: 1, gridRow: row + 2 }}
          >
            {row % 2 === 0 ? weekday : ''}
          </span>
        ))}
        {columns.map((column, week) =>
          column.map((cell, weekday) =>
            cell.future ? (
              <span key={cell.date} style={{ gridColumn: week + 2, gridRow: weekday + 2 }} />
            ) : (
              <motion.button
                key={cell.date}
                type="button"
                aria-label={t.cell(formatDay(cell.date), cell.count)}
                aria-pressed={current?.date === cell.date}
                data-count={cell.count}
                onClick={() => setSelected((s) => (s?.date === cell.date ? null : cell))}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ ...spring.default, delay: week * 0.025 }}
                className={cn(
                  // The hit area covers the gap as well (dense grid, ~43 px pitch on the iPad).
                  'focus-ring no-callout relative aspect-square w-full rounded-[30%] before:absolute before:-inset-[3px] before:content-[""]',
                  LEVEL_BG[cell.level],
                  cell.date === today && 'ring-2 ring-accent/60 ring-offset-1 ring-offset-surface',
                  current?.date === cell.date && 'ring-2 ring-fg ring-offset-2 ring-offset-surface',
                )}
                style={{ gridColumn: week + 2, gridRow: weekday + 2 }}
              />
            ),
          ),
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p
          className="min-h-6 text-sm text-fg-secondary"
          aria-live="polite"
          data-testid="activity-detail"
        >
          {current ? (
            <span className="font-medium text-fg">
              {t.cell(formatDay(current.date), current.count)}
            </span>
          ) : (
            t.hint
          )}
        </p>
        <div className="flex items-center gap-1.5 text-xs text-fg-muted" aria-hidden>
          {t.less}
          {LEVEL_BG.map((bg) => (
            <span key={bg} className={cn('size-3 rounded-[30%]', bg)} />
          ))}
          {t.more}
        </div>
      </div>
    </div>
  );
}
