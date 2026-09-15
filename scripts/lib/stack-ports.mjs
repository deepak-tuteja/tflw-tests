// `M197` (tflw `D1025`): the one place the stack's host ports and the URLs built on them are
// named. Everything that reaches a running stack — `docker-compose.yml`, `cli.mjs`, `tflw.config`
// (through tflw's `env NAME default "…"` override, `D1024`), the phase scripts, the helpers — reads
// the same variables with the same defaults, so four stacks can run on one machine with their
// ports offset and nothing else has to know which one it is talking to.
//
// The offset is `TFLW_STACK_OFFSET` (default 0): every port is its default plus the offset, and
// the URL variables below are derived from the ports. `regression.mjs --parallel-groups` gives
// worker `k` offset `100·k` and a `COMPOSE_PROJECT_NAME` of its own; a bare `node cli.mjs start`
// has offset 0 and binds the ports it always has.
//
// NOT covered, on purpose: fixtures that never reach a stack (`tests/.checkonly`,
// `tests/.constructs`, the recorded transcripts under `tests/.scratch`, the config strings inside
// `verify-check-diagnostics.mjs`) keep their literals — they are inputs to `tflw check`, and a
// port in them is text; and `tflw-acceptance/perf`'s k6/artillery corpora, which `perf-ladder`
// runs locally only and never inside a group.

/** Host port defaults, keyed by the stack service they publish. */
export const PORT_DEFAULTS = Object.freeze({
  API: 4001,
  INVENTORY: 4002,
  WEB: 8090,
  WEB_ADMIN: 8091,
  TLS: 8443, // nginx sidecar: self-signed TLS
  MTLS: 8444, // nginx sidecar: mTLS
  VULN_TLS: 8445, // nginx sidecar under VULN_MODE
});

export function stackOffset(environ = process.env) {
  const raw = environ.TFLW_STACK_OFFSET;
  if (raw === undefined || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 50000) throw new Error(`TFLW_STACK_OFFSET must be a non-negative integer, got "${raw}"`);
  return n;
}

/** Every host port at the given offset. */
export function ports(offset = stackOffset()) {
  const out = {};
  for (const [k, v] of Object.entries(PORT_DEFAULTS)) out[k] = v + offset;
  return out;
}

/** The URL variables `tflw.config` and the scripts read, at the given offset. The names are the
 *  ones `tflw.config` names in its `env NAME default "…"` lines; a script that needs a URL reads
 *  `urls().X`, never a literal. */
export function urls(offset = stackOffset()) {
  const p = ports(offset);
  return {
    TFLW_API_ORIGIN: `http://localhost:${p.API}`,
    TFLW_API_BASE: `http://localhost:${p.API}/v1`,
    TFLW_INVENTORY_ORIGIN: `http://localhost:${p.INVENTORY}`,
    TFLW_INVENTORY_BASE: `http://localhost:${p.INVENTORY}/v1`,
    TFLW_WEB_BASE: `http://localhost:${p.WEB}`,
    TFLW_WEB_ADMIN_BASE: `http://localhost:${p.WEB_ADMIN}`,
    TFLW_TLS_ORIGIN: `https://localhost:${p.TLS}`,
    TFLW_TLS_BASE: `https://localhost:${p.TLS}/v1`,
    TFLW_MTLS_ORIGIN: `https://localhost:${p.MTLS}`,
    TFLW_MTLS_BASE: `https://localhost:${p.MTLS}/v1`,
    TFLW_VULN_TLS_ORIGIN: `https://localhost:${p.VULN_TLS}`,
    TFLW_VULN_TLS_BASE: `https://localhost:${p.VULN_TLS}/v1`,
  };
}

/** The environment a worker (or `cli.mjs`) exports so that compose, tflw and every script agree:
 *  the offset, the ports as `TFLW_PORT_<NAME>`, and the URLs. */
export function stackEnv(offset = stackOffset()) {
  const env = { TFLW_STACK_OFFSET: String(offset) };
  for (const [k, v] of Object.entries(ports(offset))) env[`TFLW_PORT_${k}`] = String(v);
  return { ...env, ...urls(offset) };
}
