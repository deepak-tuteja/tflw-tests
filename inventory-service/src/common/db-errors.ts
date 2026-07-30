// Same convention as apiV2's own common/db-errors.ts — TypeORM's QueryFailedError copies the
// driver error's `code` onto itself, so this works directly against the thrown error.
export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "23505";
}
