/**
 * `M164-04`. One argv spec, one parse, readers derived from it.
 *
 * ## Why this exists
 *
 * `discover-mutation-kills.mjs` validated its arguments with a `KNOWN` set of spellings and read
 * them with index arithmetic over raw `argv` — two independently written things that nothing made
 * agree. Each flag could therefore be wrong in its own way, and four of nine were:
 *
 *   - `--why <eighteen words>`  recorded `"C97"`, because `flag()` is `argv[i + 1]`. The filed row.
 *   - `--limit=5`               validated (`split('=')[0]`) and read by nothing -> `LIMIT = Infinity`.
 *   - `--limit --status`        `Number('--status')` -> `NaN`; `.slice(0, NaN)` is `[]`, so the sweep
 *                               ran the baseline, swept **zero** candidates and exited 0 — the exact
 *                               shape `M168-02` filed and `--remeasure` was built to repair.
 *   - `--window --status`       `NaN > 0` is `false`, so **both** bracket guards are skipped and the
 *                               baseline bracket is silently disabled. That script's own help text
 *                               names the state: "0 disables, which is how the first census
 *                               corrupted itself".
 *
 * Plus an unknown positional, which fell through the `a.startsWith('--')` filter without a sound —
 * the mechanism by which the seventeen dropped words of a `--why` phrase vanished.
 *
 * That script's own comment had already reached the diagnosis and not the cure: "`KNOWN` looks like
 * a list of supported flags and is only a list of spellings that avoid exit 64; two of its six
 * entries did nothing." This module is the cure. There is one table; the validator and the readers
 * are both projections of it, so a flag cannot be spelled without being read.
 *
 * ## Arities
 *
 * `boolean`  present or absent.
 * `value`    exactly one following token, which may not itself start with `--`. Missing is an
 *            error, never a default (`D-M164-04-4`): `--limit` with a forgotten value is a typing
 *            mistake with no correct silent interpretation.
 * `rest`     every following token up to the next `--`-prefixed token or the end, joined with one
 *            space. For free prose only.
 *
 * ## Why `rest` has to exist
 *
 * Refusing unknown positionals — the obvious repair — makes the truncation loud and makes a
 * multi-word `--why` *impossible*, because no quoting at the call site survives the offload path:
 * `exec.mjs`'s `cmdExec` builds the remote command as `argv.join(' ')` with no per-token quoting,
 * and the local shell has already eaten the quotes before Node sees `argv`. Since every census runs
 * on the box, `M168-08`'s "state the cause" requirement would become unsatisfiable in practice — a
 * guard narrower than the thing it guards, inside the repair for a guard narrower than the thing it
 * guards.
 *
 * `rest` stops at the next `--`-prefixed token, which is what keeps it safe: a typo'd flag written
 * after a prose value is **refused**, not absorbed into the prose.
 */

export const BOOLEAN = 'boolean';
export const VALUE = 'value';
export const REST = 'rest';

/**
 * @param {string[]} argv    process.argv.slice(2)
 * @param {Record<string, 'boolean'|'value'|'rest'>} spec  flag (with leading `--`) -> arity
 * @returns {{ ok: true, values: Record<string, string|boolean> }
 *          | { ok: false, error: string }}
 */
export function parseArgv(argv, spec) {
  const values = Object.create(null);
  const known = (t) => Object.hasOwn(spec, t);
  const listing = () => `known: ${Object.keys(spec).join(' ')}`;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    // `--flag=value` is refused rather than implemented (`D-M164-04-3`). The old validator accepted
    // the form and no reader ever supported it, so `--limit=5` meant "no limit". Nothing recorded
    // anywhere uses it; writing a reader now would be adding a feature to fix a defect.
    if (token.startsWith('--') && token.includes('=')) {
      const [name, ...rest] = token.split('=');
      const hint = known(name) ? `use \`${name} ${rest.join('=')}\`` : listing();
      return { ok: false, error: `\`${name}=…\` is not supported — ${hint}` };
    }

    if (token.startsWith('--')) {
      if (!known(token)) return { ok: false, error: `unknown flag: ${token}\n${listing()}` };

      const arity = spec[token];
      if (arity === BOOLEAN) { values[token] = true; continue; }

      if (arity === VALUE) {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) {
          return { ok: false, error: `${token} needs a value` };
        }
        values[token] = next;
        i += 1;
        continue;
      }

      // REST
      const words = [];
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) { words.push(argv[i + 1]); i += 1; }
      // An empty `rest` is *absent*, not `""`. `--remeasure X --why` with nothing after it must
      // reach the caller's own "a retraction with no stated cause" refusal rather than record one.
      if (words.length > 0) values[token] = words.join(' ');
      continue;
    }

    // The defect this module is named for: a token that is neither a flag nor the value of one used
    // to fall through in silence, which is how seventeen words of a cause disappeared.
    return {
      ok: false,
      error: `unexpected argument: ${token}\n`
        + `  it is not a flag and no preceding flag takes it as a value.\n`
        + `  a multi-word value belongs to a \`rest\` flag `
        + `(${Object.keys(spec).filter((k) => spec[k] === REST).join(' ') || 'none here'}); `
        + `every other flag takes one token.\n${listing()}`,
    };
  }

  return { ok: true, values };
}
