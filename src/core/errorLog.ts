/**
 * Local error log (step 16): pure helpers without browser APIs. Entries must never contain
 * the API key or complete card contents, so every text is redacted and shortened.
 */

export const LOG_LEVELS = ['error', 'warn', 'info'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Number of entries the log keeps (oldest are dropped). */
export const LOG_LIMIT = 200;
/** Maximum length of a message; longer texts (e.g. with card contents) are cut. */
export const LOG_MESSAGE_MAX = 200;
/** Maximum length of the stack/detail text. */
export const LOG_DETAIL_MAX = 600;

const API_KEY_PATTERN = /sk-ant-[A-Za-z0-9_-]+/g;
const BEARER_PATTERN = /(x-api-key|authorization)(["':=\s]+)([^\s"',}]+)/gi;
const QUOTED_PATTERN = /(["„“'«])([^"„“'»]{25,})(["“”'»])/g;

function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : text;
}

/**
 * Removes secrets and long quoted texts (typical for card contents in messages) and
 * shortens the result. Whitespace runs are collapsed.
 */
export function redactLogText(text: string, max: number = LOG_MESSAGE_MAX): string {
  const cleaned = text
    .replace(API_KEY_PATTERN, 'sk-ant-[entfernt]')
    .replace(BEARER_PATTERN, '$1$2[entfernt]')
    .replace(QUOTED_PATTERN, (_match, open: string, inner: string, close: string) => {
      return `${open}${truncate(inner, 20)}${close}`;
    })
    .replace(/\s+/g, ' ')
    .trim();
  return truncate(cleaned, max);
}

/** Turns anything passed to console.error/onerror into a short message and optional stack. */
export function describeLogValue(values: readonly unknown[]): { message: string; detail?: string } {
  const parts: string[] = [];
  let detail: string | undefined;
  for (const value of values) {
    if (value instanceof Error) {
      parts.push(`${value.name}: ${value.message}`);
      if (!detail && value.stack) detail = value.stack;
    } else if (typeof value === 'string') {
      parts.push(value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      parts.push(String(value));
    } else if (value === null || value === undefined) {
      continue;
    } else {
      // Objects can contain cards: only their shape is logged, never their values.
      parts.push(`[${Array.isArray(value) ? 'Array' : 'Objekt'}]`);
    }
  }
  const message = redactLogText(parts.join(' ') || 'Unbekannter Fehler');
  return detail ? { message, detail: redactLogText(detail, LOG_DETAIL_MAX) } : { message };
}

export interface LogEntryLike {
  at: string;
  level: LogLevel;
  source: string;
  message: string;
  detail?: string;
}

export interface LogReportMeta {
  version: string;
  buildTime: string;
  userAgent: string;
  standalone: boolean;
  now: string;
}

/** Plain text for the clipboard ("Fehlerprotokoll kopieren"), newest entry first. */
export function formatLogReport(entries: readonly LogEntryLike[], meta: LogReportMeta): string {
  const header = [
    'Synapse – Fehlerprotokoll',
    `Version: ${meta.version} (Build ${meta.buildTime})`,
    `Erstellt: ${meta.now}`,
    `Gerät: ${meta.userAgent}`,
    `Homescreen-App: ${meta.standalone ? 'ja' : 'nein'}`,
    `Einträge: ${entries.length}`,
  ];
  const lines = [...entries]
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((entry) => {
      const head = `[${entry.at}] ${entry.level.toUpperCase()} ${entry.source}: ${entry.message}`;
      if (!entry.detail) return head;
      const detail = entry.detail
        .split(/ (?=at )/)
        .map((line) => `    ${line}`)
        .join('\n');
      return `${head}\n${detail}`;
    });
  return [...header, '', ...(lines.length ? lines : ['(keine Einträge)'])].join('\n');
}
