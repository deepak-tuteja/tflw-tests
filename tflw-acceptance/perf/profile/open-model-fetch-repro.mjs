// M121 / `M118-02` — standalone reproduction. No tflw, no network, no arguments.
//
// Four request shapes against one local zero-work server. Only the last one is slow, and only on
// Node 26: a `fetch` started inside a timer callback that the issuing loop does not await has its
// completion deferred to roughly the next timer tick. That is the open model's dispatch shape, and
// it is why a `hold N rps` workload reported the inter-arrival gap as service time.
//
// Read FINDINGS_M121_OPEN_MODEL_FETCH.md beside this file for the full chain and the version bisect.
// Expected: the last two rows are ~equal on Node 22/24, and differ by ~30x on Node 26.

import * as http from 'node:http';

const N = 40;
const GAP_MS = 100;

const server = http.createServer((_req, res) => res.end('{}'));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const avg = s.reduce((a, b) => a + b, 0) / s.length;
  return { avg: avg.toFixed(1), p50: s[Math.floor(s.length / 2)].toFixed(1), max: s[s.length - 1].toFixed(1) };
};

const timed = async (fn) => { const t = performance.now(); await fn(); return performance.now() - t; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// (a) sequential, awaited — the functional `tflw run` shape.
const sequential = [];
for (let i = 0; i < N; i++) sequential.push(await timed(() => fetch(url).then((r) => r.text())));

// (b) concurrent, awaited together, unpaced — pure concurrency, no timer involved.
const burst = await Promise.all(Array.from({ length: N }, () => timed(() => fetch(url).then((r) => r.text()))));

// (c) paced, fire-and-forget, over `node:http` — the open model after M121 (D206).
const agent = new http.Agent({ keepAlive: true, maxSockets: Infinity });
const pinnedGet = () => new Promise((resolve, reject) => {
  const req = http.request(new URL(url), { agent }, (res) => { res.resume(); res.on('end', resolve); });
  req.on('error', reject);
  req.end();
});
const pinned = [];
{
  const inflight = [];
  for (let i = 0; i < N; i++) { await sleep(GAP_MS); inflight.push(timed(pinnedGet).then((d) => pinned.push(d))); }
  await Promise.all(inflight);
}

// (d) paced, fire-and-forget, over `fetch` — the open model BEFORE M121. The defect.
const unpinned = [];
{
  const inflight = [];
  for (let i = 0; i < N; i++) {
    await sleep(GAP_MS);
    inflight.push(timed(() => fetch(url).then((r) => r.text())).then((d) => unpinned.push(d)));
  }
  await Promise.all(inflight);
}

console.log(`node ${process.version} — ${N} requests each, ${GAP_MS}ms pacing where paced\n`);
console.table({
  'sequential, awaited (fetch)': stats(sequential),
  'concurrent, awaited (fetch)': stats(burst),
  'paced, fire-and-forget (node:http)  <- after M121': stats(pinned),
  'paced, fire-and-forget (fetch)      <- the defect': stats(unpinned),
});

agent.destroy();
server.close();
