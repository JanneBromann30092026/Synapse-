import type { z } from 'zod';

export type ValidationCode = 'required' | 'tooLong' | 'tooSmall' | 'tooLarge' | 'invalid';

/** Thrown by repositories when input data is invalid. `field` names the offending property. */
export class ValidationError extends Error {
  override readonly name = 'ValidationError';

  constructor(
    readonly field: string,
    readonly code: ValidationCode,
    /** Position in the input array for bulk operations. */
    readonly index?: number,
  ) {
    super(
      `Invalid value for "${field}" (${code})${index === undefined ? '' : ` at index ${index}`}`,
    );
  }
}

/**
 * Thrown when a referenced record (e.g. the project of a new card) does not exist.
 * Not called "NotFoundError": Dexie would turn errors with that DOMException name into its own type.
 */
export class RecordNotFoundError extends Error {
  override readonly name = 'RecordNotFoundError';

  constructor(
    readonly entity: string,
    readonly id: string,
  ) {
    super(`${entity} not found: ${id}`);
  }
}

function toCode(issue: z.core.$ZodIssue): ValidationCode {
  switch (issue.code) {
    case 'too_small':
      return issue.origin === 'string' && issue.minimum === 1 ? 'required' : 'tooSmall';
    case 'too_big':
      return issue.origin === 'string' || issue.origin === 'array' ? 'tooLong' : 'tooLarge';
    case 'invalid_type':
      return issue.input === undefined ? 'required' : 'invalid';
    default:
      return 'invalid';
  }
}

/** Parses with zod and converts the first issue into a ValidationError. */
export function parseOrThrow<S extends z.ZodType>(
  schema: S,
  input: unknown,
  index?: number,
): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  const issue = result.error.issues[0];
  const field = issue ? issue.path.map(String).join('.') || 'value' : 'value';
  throw new ValidationError(field, issue ? toCode(issue) : 'invalid', index);
}
