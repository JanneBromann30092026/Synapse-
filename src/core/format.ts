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
