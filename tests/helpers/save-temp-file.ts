// JS escape hatch (gap #17 consumption, M24): writes a `capture body bytes as ...`'d Buffer to a
// scratch file on disk and **returns where it put it**, so a second fetch of the same endpoint can
// be compared against it via `matches file "{scratchPath}"`. Filesystem scratch-space management,
// not an assertion — the correct side of the escape-hatch fence (SPEC §11).
//
// The return value was dead weight until tflw M101/D174: `matches file` was the one file operand
// that read its path literally, so the .tflw file had to repeat this path by hand and a comment
// here explained the workaround as settled behaviour. It was not settled, it was an omission —
// filed as `A4-OS-09` and fixed. The path is now stated once, in this file, and the assertion uses
// whatever this returns.
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
