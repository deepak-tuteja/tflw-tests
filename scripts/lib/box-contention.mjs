// Is the box contended? `M190b` (`D991`), testFlow `PLAN_M190B_CONTENDED_KILLS.md`.
//
// `M190`'s census took one false `assertion` kill and one baseline drift during the window another
// session's ComfyUI was swap-thrashing beside it (2026-09-13 ~22:40, the dashboard's incident log).
// Both were caught by placement — the reach control and a window's baseline re-roster — and a red
// landing elsewhere would have stood. The sweep now asks the box before it starts and before it
// closes a window, and this module is the question as a pure function so its answer can be shown
// on the incident's own shape without a render.
//
// Two reads, both from the dashboard's CLI (`fedora-box-dashboard`, `statsctl`):
//   - `statsctl tenants` — per-tenant payloads: a `gpu-render` tenant's queue, a `moe` server's
//     `running`. Resident is not the hazard: at 10:40 on 2026-09-14 ComfyUI was up 10 h with an
//     empty queue and 0.08 GB of VRAM, and the sweep beside it measured cleanly. Rendering is.
//   - `statsctl check --for tflw:load` — `psi_mem_full60`, the kernel's memory-stall fraction over
//     the last minute. The 22:40 storm was swap; a queue can be empty while the box is still
//     paging a model out.
// The lock being held is NOT a reason: the sweep's own lease holds it (`M190`'s box-side holder).
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** `psi_mem_full60` at or above this refuses. 1.0 = one percent of the last minute fully stalled. */
export const PSI_FULL60_CEILING = 1.0;

/**
 * @param {object|null} tenants  parsed `statsctl tenants`
 * @param {object|null} check    parsed `statsctl check --for tflw:load`
 * @returns {{ ok: boolean, reasons: string[], seen: string[] }}
 */
export function decide(tenants, check) {
  const reasons = [];
  const seen = [];
  for (const t of tenants?.tenants ?? []) {
    const p = t.payload ?? {};
    if (t.class === 'gpu-render') {
      const q = (p.comfy?.queue_running ?? 0) + (p.comfy?.queue_pending ?? 0);
      seen.push(`${t.id}: ${p.running ? 'resident' : 'down'}, queue ${q}`);
      if (p.running && q > 0) reasons.push(`${t.label ?? t.id} has ${q} render(s) in flight`);
    } else {
      seen.push(`${t.id}: ${p.running ? 'running' : 'down'}`);
      if (p.running) reasons.push(`${t.label ?? t.id} (${t.class}) is running`);
    }
  }
  const psi = check?.psi_mem_full60;
  if (typeof psi === 'number') {
    seen.push(`psi_mem_full60 ${psi}`);
    if (psi >= PSI_FULL60_CEILING) reasons.push(`memory stall: psi_mem_full60 ${psi} ≥ ${PSI_FULL60_CEILING}`);
  } else {
    reasons.push('`statsctl check` reported no psi_mem_full60 — the box cannot be read');
  }
  return { ok: reasons.length === 0, reasons, seen };
}

/**
 * Read the box and decide. On macOS the sweep never runs for real, so the gate is skipped and says
 * so; on Linux a missing `statsctl` refuses — the box has one, and a box without it is not the box.
 */
export function readBox({ platform = process.platform, statsctl = `${process.env.HOME}/boxd/statsctl` } = {}) {
  if (platform === 'darwin') return { ok: true, skipped: 'macOS: the contention gate reads the box only', reasons: [], seen: [] };
  // `statsctl check` exits non-zero for `wait` and `no-go` — and `wait` is what it says while the
  // sweep's OWN lease holds the lock, which is every time this runs. The payload is on stdout
  // whatever the exit code; the exit code is not the reading. Found live on the first run.
  const read = (args) => {
    let out = '';
    try { out = execFileSync(statsctl, args, { encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { out = typeof e.stdout === 'string' ? e.stdout : ''; if (!out.trim()) return { $error: e.message }; }
    try { return JSON.parse(out); } catch (e) { return { $error: `not JSON: ${out.slice(0, 80)}` }; }
  };
  const tenants = read(['tenants']);
  const check = read(['check', '--for', 'tflw:load']);
  if (tenants.$error || check.$error) {
    return { ok: false, reasons: [`statsctl could not be read: ${(tenants.$error ?? check.$error).split('\n')[0]}`], seen: [] };
  }
  return decide(tenants, check);
}

function selfTest() {
  const ok = []; const bad = [];
  const t = (name, cond) => (cond ? ok : bad).push(name);
  const comfy = (running, run, pending) => ({ id: 'comfyui', label: 'ComfyUI', class: 'gpu-render', payload: { running, comfy: { queue_running: run, queue_pending: pending, vram_used_gb: 0.08 } } });
  const moe = (running) => ({ id: 'moe', label: 'llama-server', class: 'moe', payload: { running } });

  // 2026-09-14 10:40, measured: resident, idle, clean sweep beside it.
  const idle = decide({ tenants: [moe(false), comfy(true, 0, 0)] }, { psi_mem_full60: 0.0 });
  t('a resident ComfyUI with an empty queue and no stall is not contention', idle.ok && idle.reasons.length === 0);
  t('what was seen is reported even when nothing refuses', idle.seen.length === 3);

  // 2026-09-13 22:40, the incident's shape: a render queued and the box paging.
  const storm = decide({ tenants: [moe(false), comfy(true, 1, 2)] }, { psi_mem_full60: 12.4 });
  t('a render in flight refuses', !storm.ok && storm.reasons.some((r) => /3 render\(s\) in flight/.test(r)));
  t('a memory stall refuses on its own line', storm.reasons.some((r) => /psi_mem_full60 12.4/.test(r)));

  t('a render queued with no stall still refuses — the stall follows the render, not the other way',
    !decide({ tenants: [comfy(true, 1, 0)] }, { psi_mem_full60: 0 }).ok);
  t('a stall with an empty queue still refuses — the box can page a model out after the queue empties',
    !decide({ tenants: [comfy(true, 0, 0)] }, { psi_mem_full60: 1.0 }).ok);
  t('a stall just under the ceiling does not', decide({ tenants: [] }, { psi_mem_full60: 0.99 }).ok);
  t('a running llm server refuses whatever its queue', !decide({ tenants: [moe(true)] }, { psi_mem_full60: 0 }).ok);
  t('a down ComfyUI is not a render', decide({ tenants: [comfy(false, 5, 5)] }, { psi_mem_full60: 0 }).ok);
  t('no psi reading refuses rather than assuming quiet', !decide({ tenants: [] }, {}).ok);
  t('no tenants payload at all is quiet if psi is', decide(null, { psi_mem_full60: 0 }).ok);
  t('macOS skips and says so', readBox({ platform: 'darwin' }).skipped?.startsWith('macOS'));
  t('Linux with no statsctl refuses', !readBox({ platform: 'linux', statsctl: '/nonexistent/statsctl' }).ok);
  {
    // `check` says `wait` with exit 20 while our own lease holds the lock: the payload must still be read.
    const dir = mkdtempSync(path.join(tmpdir(), 'statsctl-'));
    const fake = path.join(dir, 'statsctl');
    writeFileSync(fake, '#!/bin/sh\nif [ "$1" = tenants ]; then echo \'{"tenants":[]}\'; exit 0; fi\necho \'{"psi_mem_full60":0.0,"verdict":"wait","lock":{"held":true,"holder":"tflw:exec"}}\'; exit 20\n');
    chmodSync(fake, 0o755);
    const v = readBox({ platform: 'linux', statsctl: fake });
    t('a `wait` verdict with a non-zero exit is read from stdout, and the lock being ours is not contention', v.ok && v.seen.includes('psi_mem_full60 0'));
    writeFileSync(fake, '#!/bin/sh\necho not json; exit 20\n');
    t('a non-zero exit with no payload refuses', !readBox({ platform: 'linux', statsctl: fake }).ok);
    rmSync(dir, { recursive: true, force: true });
  }

  if (bad.length) {
    console.error(`✗ box-contention self-test: ${bad.length} of ${ok.length + bad.length} control(s) did not fire`);
    for (const b of bad) console.error(`    · ${b}`);
    return 1;
  }
  console.log(`✓ box-contention self-test: ${ok.length} control(s), each shown to fire on the input it exists for`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--self-test')) {
    console.error('✗ this module is a library; its only command-line mode is `--self-test`.');
    process.exit(64);
  }
  process.exit(selfTest());
}
