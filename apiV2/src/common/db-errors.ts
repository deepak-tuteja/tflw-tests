// TypeORM's QueryFailedError copies the driver error's own properties (including Postgres's
// `code`) onto itself, so these checks work directly against the thrown error without unwrapping.
export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === '23505';
}

export function isForeignKeyViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === '23503';
}
