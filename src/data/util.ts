export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Removes keys whose value is undefined, so optional fields are really absent in the stored record. */
export function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Applies a validated partial update: only allowed keys present in the raw input change,
 * so an optional field cleared to "" (parsed as undefined) is removed from the record.
 */
export function applyPatch<T extends object>(
  existing: T,
  rawInput: object,
  parsed: Partial<T>,
  allowedKeys: readonly (keyof T & string)[],
): T {
  const next = { ...existing } as Record<string, unknown>;
  const values = parsed as Record<string, unknown>;
  for (const key of allowedKeys) {
    if (key in rawInput) {
      next[key] = values[key];
    }
  }
  return compact(next) as T;
}
