import { createServer, Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// JS escape hatch (M33, plan_v2.md Part R Cluster C, TFLW-GAPS.md gap #18): a real throwaway HTTP
// receiver apiV2's fulfillment webhook (JobsService.deliverWebhook) can actually POST to. There is
// no declarative way to stand up an inbound listener or observe "did a request arrive at this URL"
// from inside the closed `.tflw` grammar (SPEC §7.5's hard fence — no loops/conditionals, and
// nothing resembling a server primitive at all) — same escape-hatch-by-design precedent as
// schema-check.ts's `assert matches schema(...)`: the JS call itself *is* the assertion.
//
// One in-memory receiver per port, keyed by port so a single file with multiple tests (or a
// single test starting more than one receiver) never collides — `--workers N` parallelizes whole
// files as separate processes, so cross-file isolation is free; within one file, tests run
// serially, so this map only ever grows across a file's own tests.
interface ReceivedCall {
  path: string;
  body: unknown;
}

interface Receiver {
  server: Server;
  calls: ReceivedCall[];
}

const receivers = new Map<number, Receiver>();

function portFromUrl(url: string): number {
  return Number(new URL(url).port);
}

// apiV2 fires this webhook from *inside* its Docker container (docker-compose.yml's `api`
// service), not from the host `tflw run` runs on — so the URL handed back has to resolve from
// the container's own network namespace, not the host's. `host.docker.internal` is docker-
// compose.yml's `extra_hosts: host-gateway` entry (M33), which routes back to whatever's
// listening on the host's own ports; binding the receiver itself to `0.0.0.0` (not `127.0.0.1`)
// is what actually makes it reachable via that route rather than only from the host loopback.
export async function startWebhookReceiver(_ctx: { env: NodeJS.ProcessEnv }): Promise<string> {
  const calls: ReceivedCall[] = [];

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body: unknown = raw;
      try {
        body = raw.length > 0 ? JSON.parse(raw) : {};
      } catch {
        // non-JSON body: keep the raw string, this receiver doesn't require JSON to record a call
      }
      calls.push({ path: req.url ?? '/', body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
  const port = (server.address() as AddressInfo).port;
  receivers.set(port, { server, calls });

  return `http://host.docker.internal:${port}/webhook`;
}

// Polls (rather than checking once) since webhook delivery is genuinely async — it happens after
// fulfillment's own two staged delays (JobsService.STAGE_DELAY_MS), on a timeline this helper has
// no other way to synchronize with. Throws (not a boolean) so the call site needs no separate
// `expect` — same "the call itself is the assertion" pattern as schema-check.ts.
export async function assertWebhookReceived(
  _ctx: { env: NodeJS.ProcessEnv },
  url: string,
  expectedEvent: string,
  expectedOrderId: string,
  timeoutMs: number,
): Promise<string> {
  const receiver = receivers.get(portFromUrl(url));
  if (!receiver) throw new Error(`no webhook receiver listening for ${url}`);

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const match = receiver.calls.find((call) => {
      const body = call.body as Record<string, unknown>;
      return body?.event === expectedEvent && body?.orderId === expectedOrderId;
    });
    if (match) {
      return `received "${expectedEvent}" for order ${expectedOrderId} at ${match.path}`;
    }
    if (Date.now() >= deadline) {
      const seen = receiver.calls.map((c) => JSON.stringify(c.body)).join(', ') || '(none)';
      throw new Error(
        `no webhook call matching event "${expectedEvent}" / orderId "${expectedOrderId}" arrived ` +
          `within ${timeoutMs}ms; calls actually received: [${seen}]`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

// The negative counterpart: `expect` has no subject for an arbitrary captured/let value (SPEC
// §5.3's subjects are strictly response-scoped — status/header/body/duration/request), so a plain
// "assert this count is zero" has to be a throwing JS call too, not a bare `expect {var}`.
export async function assertWebhookNotReceived(
  _ctx: { env: NodeJS.ProcessEnv },
  url: string,
  graceMs: number,
): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, graceMs));
  const receiver = receivers.get(portFromUrl(url));
  const count = receiver?.calls.length ?? 0;
  if (count > 0) {
    const seen = receiver!.calls.map((c) => JSON.stringify(c.body)).join(', ');
    throw new Error(`expected no webhook calls, but received ${count}: [${seen}]`);
  }
  return 'no webhook calls received, as expected';
}

export async function stopWebhookReceiver(
  _ctx: { env: NodeJS.ProcessEnv },
  url: string,
): Promise<void> {
  const port = portFromUrl(url);
  const receiver = receivers.get(port);
  if (!receiver) return;
  await new Promise<void>((resolve) => receiver.server.close(() => resolve()));
  receivers.delete(port);
}
