import { describeLogValue, formatLogReport, type LogLevel } from '@/core/errorLog';
import { logsRepo } from '@/data/repositories';
import { isStandalone } from './displayMode';

/** Entries caught before the database is open (or while it is unavailable). */
const MAX_PENDING = 50;
/** The same message within this window is stored only once (e.g. errors in a render loop). */
const DUPLICATE_WINDOW_MS = 2000;

interface PendingEntry {
  level: LogLevel;
  source: string;
  message: string;
  detail?: string;
}

let ready = false;
let installed = false;
/** Writes run one after another, so bursts of errors keep their order. */
let queue: Promise<void> = Promise.resolve();
const pending: PendingEntry[] = [];
const lastSeen = new Map<string, number>();

function write(entry: PendingEntry): Promise<void> {
  queue = queue.then(
    // Best effort and silent: a failed write must never log itself again.
    () => logsRepo.add(entry).catch(() => undefined),
  );
  return queue;
}

/** Records an entry (redacted) in the local error log. Never throws. */
export function logEntry(level: LogLevel, source: string, values: readonly unknown[]): void {
  const { message, detail } = describeLogValue(values);
  const key = `${level}|${source}|${message}`;
  const now = Date.now();
  const previous = lastSeen.get(key);
  if (previous !== undefined && now - previous < DUPLICATE_WINDOW_MS) return;
  lastSeen.set(key, now);
  if (lastSeen.size > 100) lastSeen.clear();

  const entry: PendingEntry = detail
    ? { level, source, message, detail }
    : { level, source, message };
  if (!ready) {
    if (pending.length < MAX_PENDING) pending.push(entry);
    return;
  }
  void write(entry);
}

/** Called once the database is open: stores what was caught during startup. */
export async function markErrorLogReady(): Promise<void> {
  ready = true;
  const queued = pending.splice(0);
  for (const entry of queued) await write(entry);
}

/**
 * Catches uncaught errors, unhandled promise rejections and console.error/warn calls.
 * The console keeps working as before.
 */
export function installErrorLogging(): void {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (event) => {
    logEntry('error', 'window', [event.error ?? event.message]);
  });
  window.addEventListener('unhandledrejection', (event) => {
    logEntry('error', 'promise', [event.reason]);
  });

  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);
  console.error = (...args: unknown[]) => {
    originalError(...args);
    logEntry('error', 'console', args);
  };
  console.warn = (...args: unknown[]) => {
    originalWarn(...args);
    logEntry('warn', 'console', args);
  };
}

/** The log as plain text for the clipboard (no API key, no complete card contents). */
export async function buildErrorReport(): Promise<string> {
  const entries = await logsRepo.list();
  return formatLogReport(entries, {
    version: __APP_VERSION__,
    buildTime: __BUILD_TIME__,
    userAgent: navigator.userAgent,
    standalone: isStandalone(),
    now: new Date().toISOString(),
  });
}
