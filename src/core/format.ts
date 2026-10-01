const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * Formats a byte count as a short, human-readable German string, e.g. "1,5 MB".
 * Uses decimal units (1 KB = 1000 B) like iPadOS does in its storage settings.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '–';
  }
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < UNITS.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 || value >= 100 ? 0 : 1;
  const formatted = new Intl.NumberFormat('de-DE', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
  return `${formatted} ${UNITS[unitIndex]}`;
}

/**
 * Short German duration, e.g. "45 s", "2:05 min", "1:02 h" (seconds rounded).
 * Invalid or negative values yield "–".
 */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '–';
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const pad = (n: number) => String(n).padStart(2, '0');
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}:${pad(totalSeconds % 60)} min`;
  return `${Math.floor(minutes / 60)}:${pad(minutes % 60)} h`;
}

/** Seconds with one decimal below 10 s, e.g. "4,2 s", "12 s"; "–" for null. */
export function formatSeconds(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '–';
  const seconds = ms / 1000;
  const formatted = new Intl.NumberFormat('de-DE', {
    maximumFractionDigits: seconds < 10 ? 1 : 0,
  }).format(seconds);
  return `${formatted} s`;
}

const dateTimeFormat = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** "01.10.2026, 14:05" (local time). */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}
