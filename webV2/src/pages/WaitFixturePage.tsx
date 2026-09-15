import { useEffect, useState } from 'react';

// `M198` S5 (`M189-03`) — the harness for the **poll budgets**, which are the one part of a
// `wait until` this suite has never been able to observe.
//
// Every browser plant in this repository is satisfied on its first poll: the app under test is
// local, fast and already rendered by the time a step asks anything of it. That is what makes four
// registry mutations of the budget lines *reached and not asserted* — the code runs on every one of
// those plants and the answer never depends on it, because a wait that is true immediately never
// reaches a deadline and never has to say which number bounded it.
//
// A page cannot state a budget. What it can do is be **late on purpose**, by an amount chosen
// against the two constants the mutations turn on, and that is all this page is.
//
// ## The reveal at 5 s, and why not sooner
//
// `SPECULATIVE_DIAGNOSIS_MS` is 3000 in `browser.ts`, and
// `speculative-line-replaces-the-final-diagnosis` turns that progress mark into a deadline
// (`deadline = startedAt + Math.min(timeoutMs, SPECULATIVE_DIAGNOSIS_MS)`). So the discriminating
// input is an element that resolves **after 3 s and well before `timeout browser`**, which is 30 s
// here because nothing in this repository's config narrows it.
//
// 5000 ms sits 2 s past the mutant's deadline and 25 s inside the real one. Both margins are
// deliberate and they are not symmetric: the lower one has to survive a loaded box adding latency
// to page load and React's first paint, and the upper one costs nothing. A reveal at 3500 ms would
// have been a test that fails on the box under a forge render and passes on this Mac, which is the
// `M157g` trap — **raise the effect, do not narrow the margin**.
//
// ## Why the banner is never late
//
// `ui-wait-ignores-its-own-budget` is graded off the `for <duration>` backstop rather than off
// elapsed time, because the locator form's timeout message does not name its budget at all — it
// reports the matcher's own outcome, so there is no number in it to read. The backstop *does* name
// one: a hold window at least as long as the poll budget can never be satisfied, and the refusal
// quotes the budget it measured against. A plant writes `for 3s timeout wait 2000ms`, which is
// unsatisfiable against the step's own 2 s and perfectly satisfiable against the config's 5 s, so
// the two builds answer with two different *kinds* of result rather than two different timings.
// That needs a condition which is true from the first paint and stays true, which is what the
// banner is. Nothing on this page may make it flicker.
//
// ## The probe request
//
// `wait-reader-picks-the-subject-over-the-ref` is about the *reader's* ordering: `status of request
// to "…"` is a `StatusSubject` carrying a network ref, and the mutant consults the ref only for a
// bare `NetworkRequestSubject`, so the status form falls through to the response-scope throw. To
// grade it the page has to make one observable request, late enough that a wait started after
// `open` is genuinely polling when it arrives. `/v1/health` is apiV2's own health route, needs no
// session, and is proxied same-origin by nginx and by Vite alike.
//
// Public route, no login, static markup, nothing seeded and nothing random — the same four rules
// the other four fixture pages keep. The only thing that varies here is *when*, and it varies by a
// fixed number of milliseconds.
const REVEAL_MS = 5000;
const PROBE_MS = 1200;

export function WaitFixturePage() {
  const [revealed, setRevealed] = useState(false);
  const [probe, setProbe] = useState<string>('not yet requested');

  useEffect(() => {
    const reveal = setTimeout(() => setRevealed(true), REVEAL_MS);
    const probeTimer = setTimeout(() => {
      fetch('/v1/health')
        .then((res) => setProbe(`answered ${res.status}`))
        .catch(() => setProbe('probe failed'));
    }, PROBE_MS);
    return () => {
      clearTimeout(reveal);
      clearTimeout(probeTimer);
    };
  }, []);

  return (
    <section className="wait-fixture" aria-labelledby="wait-fixture-heading">
      <h1 id="wait-fixture-heading">Wait fixture</h1>

      {/* True at first paint and true forever after. The `for <duration>` backstop is graded
          against this, so a condition that flickers would turn a refusal into a timeout. */}
      <p data-testid="wait-fixture-banner">Inventory sync is running.</p>

      {/* Absent for REVEAL_MS, then present for the rest of the page's life. Nothing removes it
          again: a locator that resolves and then stops resolving is a different claim. */}
      {revealed ? (
        <button type="button" data-testid="wait-fixture-ready">
          Ready to publish
        </button>
      ) : null}

      <p data-testid="wait-fixture-probe">Health probe: {probe}</p>
    </section>
  );
}
