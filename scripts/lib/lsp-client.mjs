// A real LSP client over stdio, stdlib only (`M195` S2, tflw `D1017`). tflw's own
// `packages/lsp-server/test/protocol.test.ts` speaks the wire protocol too, but over an in-memory
// stream pair to `startServer()` in-process; what no test anywhere drove was `tflw lsp` as a
// *process* — the transport an editor gets, with the framing, the process's own stdin/stdout, and
// the project's `tflw.config` found on disk from the opened file's path. That transport is the gap,
// so this is a client and not a mock: `Content-Length` framing both ways, JSON-RPC ids, and the
// server's notifications routed to whoever asked for them.
import { spawn } from 'node:child_process';

export function startLspClient(command, args, { cwd, env = process.env } = {}) {
  const child = spawn(command, args, { cwd, env: { ...env, FORCE_COLOR: '0' }, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(); // id → { resolve, reject, method }
  const listeners = new Map(); // method → [fn]
  let nextId = 1;
  let stderr = '';
  let exitCode = null;
  const exited = new Promise((resolve) => child.on('exit', (code) => ((exitCode = code), resolve(code))));
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (d) => (stderr += d));

  // Framing: headers up to a blank line, then exactly `Content-Length` bytes of JSON. Byte-exact,
  // not character-exact — a diagnostic message with a non-ASCII character is longer in bytes than
  // in characters, and a client that slices a string by the header's number desynchronises on it.
  let buffer = Buffer.alloc(0);
  child.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      const header = buffer.subarray(0, headerEnd).toString('ascii');
      const m = /Content-Length:\s*(\d+)/i.exec(header);
      if (!m) throw new Error(`lsp: a frame without Content-Length: ${JSON.stringify(header)}`);
      const length = Number(m[1]);
      const bodyStart = headerEnd + 4;
      if (buffer.length < bodyStart + length) return;
      const body = buffer.subarray(bodyStart, bodyStart + length).toString('utf8');
      buffer = buffer.subarray(bodyStart + length);
      dispatch(JSON.parse(body));
    }
  });

  function dispatch(msg) {
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.reject(Object.assign(new Error(`${p.method}: ${msg.error.message}`), { code: msg.error.code, data: msg.error.data }));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method && msg.id !== undefined) {
      // A request from the server (`client/registerCapability`, `workspace/configuration`): answered
      // with null so the server never waits on a client that has no opinion.
      send({ jsonrpc: '2.0', id: msg.id, result: null });
      return;
    }
    for (const fn of listeners.get(msg.method) ?? []) fn(msg.params);
    for (const fn of listeners.get('*') ?? []) fn(msg);
  }

  function send(msg) {
    const body = Buffer.from(JSON.stringify(msg), 'utf8');
    child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
    child.stdin.write(body);
  }

  return {
    request(method, params, timeoutMs = 30000) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method}: no response within ${timeoutMs}ms${stderr ? `; server stderr:\n${stderr.slice(-800)}` : ''}`));
        }, timeoutMs);
        pending.set(id, { method, resolve: (v) => (clearTimeout(timer), resolve(v)), reject: (e) => (clearTimeout(timer), reject(e)) });
        send({ jsonrpc: '2.0', id, method, params });
      });
    },
    notify(method, params) {
      send({ jsonrpc: '2.0', method, params });
    },
    on(method, fn) {
      if (!listeners.has(method)) listeners.set(method, []);
      listeners.get(method).push(fn);
      return () => listeners.set(method, listeners.get(method).filter((f) => f !== fn));
    },
    stderr: () => stderr,
    exitCode: () => exitCode,
    /** `shutdown` then `exit`, the protocol's own ending; the exit code the process actually gave. */
    async stop(timeoutMs = 10000) {
      try {
        await this.request('shutdown', null, timeoutMs);
        this.notify('exit', null);
      } catch {
        // a server that cannot answer shutdown is killed below and the caller sees the code
      }
      await Promise.race([exited, new Promise((r) => setTimeout(r, timeoutMs))]);
      if (exitCode === null) child.kill('SIGKILL');
      return exitCode;
    },
  };
}

/** Line/character from an offset, the LSP's (0-based, UTF-16 — the corpus is ASCII, so bytes). */
export function positionAt(text, offset) {
  const before = text.slice(0, offset);
  const line = (before.match(/\n/g) ?? []).length;
  const character = offset - (before.lastIndexOf('\n') + 1);
  return { line, character };
}

export function offsetAt(text, { line, character }) {
  const lines = text.split('\n');
  let offset = 0;
  for (let i = 0; i < line; i++) offset += lines[i].length + 1;
  return offset + character;
}

/** Apply a `WorkspaceEdit`'s changes for one document, last edit first so earlier offsets hold. */
export function applyEdits(text, edits) {
  const sorted = [...edits].sort((a, b) => offsetAt(text, b.range.start) - offsetAt(text, a.range.start));
  let out = text;
  for (const e of sorted) out = out.slice(0, offsetAt(text, e.range.start)) + e.newText + out.slice(offsetAt(text, e.range.end));
  return out;
}
