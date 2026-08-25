import { useEffect, useRef, useState } from 'react';

// `M154d` (testFlow `PLAN_M154_DOGFOOD_CONFORMANCE.md`, `D722`/`D729`): the observation harness for
// the four browser steps whose effect nothing in this suite can see.
//
// ## Why a harness page, and why not the pages that already use these steps
//
// `D729` orders real flows first, and for this batch the real flows exist — `hover` and `scroll to`
// have run on `/a11y-demo` since M40. What they do not have is an **observable**. Both land on
// "Save preferences" and are followed by a tick/untick assertion that holds identically whether
// either step ran at all; deleting both leaves that test green. That is the same vacuity `M154d`
// found in `press "Escape"`, and it is not fixable by asserting harder on a page where the pointer
// changes nothing.
//
// So the missing thing is a *surface that reacts*, and the reason it is not added to
// `AccessibilityDemoPage` is specific: that page is the target of `C35`'s a11y-violation counts.
// A hover-revealed tooltip and a scroll sentinel are exactly the kind of markup that moves an axe
// score, so building them there would couple two plants — one of which grades a *number* — through
// shared markup. `RenderFixturePage.tsx` (M45) and `LocatorFixturePage.tsx` set the precedent for
// a page that exists because a dogfood assertion cannot be made stable against a page built for
// humans; this is the third.
//
// Same rules as those pages: public route, static markup, no seeded or random data, nothing that
// varies by machine.
//
// ## What each section makes observable
//
// **hover** — the pointer landing on an element is distinguishable from a *click* on it and from
// nothing at all, because `onMouseEnter` and `onClick` write different tokens to the same readout.
// A `hover` that had degenerated into a click reports `clicked:menu`; one that did nothing leaves
// `none`. The tooltip is a second, independent observation of the same event in the language's own
// idiom (`expect text … is visible`), so the row does not rest entirely on a `data-` attribute.
//
// **scroll to** — an `IntersectionObserver` on a sentinel below a deliberately tall spacer, latched
// on first intersection and never reset. Latched because the assertion must not depend on the
// element *still* being on screen when it runs: Playwright's visibility has nothing to do with the
// viewport (an off-screen element is `visible`), so an un-latched sentinel would be graded by
// whatever scrolled last rather than by `scroll to`.
//
// **pause is deliberately absent**, and a stopwatch section was built here and then removed.
// `TF033`: "`pause` is only legal inside a workload-bearing `test`" — it is `M67`'s per-iteration
// pacing, not a general wait, so no browser page can grade it. It is a perf-tier construct and
// `M154e` grades it against an arrival curve (`D726`). Recorded here because the removed section
// looked entirely reasonable and the checker is what said otherwise.
//
// **viewport** — `innerWidth`×`innerHeight`, re-read on resize. The config key claims to set "the
// browser window size every browser test starts at", and until now nothing in this repository read
// the window's size at all.
export function StepFixturePage() {
  const [pointer, setPointer] = useState('none');
  const [tooltip, setTooltip] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [size, setSize] = useState('unmeasured');
  const sentinel = useRef<HTMLDivElement | null>(null);

  // Latched on the first intersection and never cleared — see the header. `rootMargin` is left at
  // its default so "intersecting" means the real viewport and not a padded one.
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setScrolled(true);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const measure = () => setSize(`${window.innerWidth}x${window.innerHeight}`);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <section className="step-fixture" aria-labelledby="step-fixture-heading">
      <h1 id="step-fixture-heading">Step fixture</h1>
      <p>
        Observation points for browser steps whose effect is otherwise invisible. Nothing here is a
        storefront feature.
      </p>

      <output id="pointer-readout" data-token={pointer}>
        {pointer}
      </output>

      <div data-group="hover">
        <button
          type="button"
          onMouseEnter={() => {
            setPointer('hovered:menu');
            setTooltip(true);
          }}
          onMouseLeave={() => setTooltip(false)}
          onClick={() => setPointer('clicked:menu')}
        >
          Open menu
        </button>
        {/*
          Rendered only while the pointer is over the button, so its visibility is the same event
          the readout records, observed a second way. The text is a token rather than a plausible
          caption: an assertion that passed on prose this page happened to contain elsewhere would
          be the near-miss this whole file exists to rule out.
        */}
        {tooltip ? <span role="tooltip">pointer-is-over-the-menu</span> : null}
      </div>

      <output id="viewport-readout" data-size={size}>
        {size}
      </output>

      {/*
        Taller than any viewport this suite configures, so the sentinel below starts off-screen
        under both the default 1280x720 and the plant's own 900x600. A spacer that fitted would make
        the scroll row pass without scrolling.
      */}
      <div style={{ height: '2400px' }} aria-hidden="true" />

      <div ref={sentinel} data-group="scroll">
        <output id="scroll-readout" data-seen={scrolled ? 'yes' : 'no'}>
          {scrolled ? 'yes' : 'no'}
        </output>
        <button type="button">Bottom marker</button>
      </div>
    </section>
  );
}
