// JS escape hatch (gap #17 consumption, M24): writes a `capture body bytes as ...`'d Buffer to a
// fixed scratch file on disk, so a second fetch of the same endpoint can be compared against it
// via `matches file` — whose own path operand is a plain string literal, never `{var}`-
// interpolated (same established precedent as `matches schema "..." from "..."`), so the .tflw
// file's `matches file` line has to name this exact path directly rather than a runtime-computed
// one. Filesystem scratch-space management, not an assertion — the correct side of the
// escape-hatch fence (SPEC §11).
//
// Resolved relative to this file's own location, not `process.cwd()` — the JS helper's ctx
// carries no `baseDir` (only `env`, interpreter.ts's `execCall`). `tests/.scratch/` is gitignored,
// regenerated fresh every run, never a committed fixture.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRATCH_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.scratch');
const SCRATCH_PATH = join(SCRATCH_DIR, 'receipt-roundtrip.bin');

export function saveTempFile(_ctx: { env: NodeJS.ProcessEnv }, bytes: Buffer): string {
  mkdirSync(SCRATCH_DIR, { recursive: true });
  writeFileSync(SCRATCH_PATH, bytes);
  return SCRATCH_PATH;
}
