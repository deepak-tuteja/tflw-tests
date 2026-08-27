// `M154g` step 2d / `C78` — the positive half of `declaration:use`, and the reason it is a *digest*
// rather than something friendlier to read.
//
// The manifest calls `use` "the JS escape hatch — a helper module whose exports become callable".
// Nineteen files here already `use` a helper, and every one of them proves that sentence only in
// the weakest possible way: the helper sleeps, paginates, signs, or reaches the same API the DSL
// could have reached itself, so a `use` that silently resolved to nothing would surface as some
// later step failing for an unrelated-looking reason, if at all.
//
// This one returns a value the DSL **cannot compute** — tflw has no arithmetic, no loop over a
// string's code points and no hex formatting — against a fixed input, so the expected answer is a
// constant a fixture can hard-code. A `use` that imported nothing cannot produce it by accident.
// Deliberately not a cryptographic hash: this has to be reproducible by hand from the four lines
// below when someone asks why the fixture expects that particular string.
export async function c78Digest(_ctx: { env: NodeJS.ProcessEnv }, input: string): Promise<string> {
  let h = 0;
  for (const ch of input) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return `c78-${h.toString(16)}`;
}
