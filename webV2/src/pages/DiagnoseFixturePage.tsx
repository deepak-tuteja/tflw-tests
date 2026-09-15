// `M198` S2/S3 (`M189-02`) — the harness for the **sentences a failure carries**, which is the one
// thing about tflw's locators this suite has never read.
//
// `LocatorFixturePage` grades *which element answered*: every candidate writes its own token, so a
// locator that lands on a decoy is named rather than merely absent. That page cannot grade a
// locator that lands on **nothing**, because a miss has no token to write — its whole answer is a
// sentence in `results.json`. `M189a` measured ten registry mutations of that sentence as reached
// and not asserted: every browser plant in this repository runs through the diagnosis formatter and
// reads the element that answered instead.
//
// Its own page, not markup bolted onto `/locator-fixture`, for `D729`'s reason and one sharper.
// The near-misses this page needs are *collisions* — two controls with one accessible name, an
// icon-only button with no name at all, a dozen identical rows — and `/locator-fixture`'s known
// answers are resolutions, which collisions would change. Coupling a plant that grades an element
// to a plant that grades a sentence through shared markup is how one repair breaks the other.
//
// Same rules as the other three fixture pages: public route, static markup, no seeded or random
// data, nothing that varies by machine, and nothing here is reachable from the storefront's nav.
//
// ## What each section makes sayable
//
// **Two `Save draft` buttons, in two named containers.** A near-miss (`button "Save drarft"`) has
// to answer with a *deduped* list — the same suggestion printed twice spends two of five candidate
// slots on one string, and on a crowded page a genuinely different candidate cannot be shown at all
// (`nearest-matches-not-deduped`). Deduping alone is the trap, though: `button "Save draft"` pasted
// back into this page is *ambiguous*, a different failure from the one being diagnosed, so the
// deduped line has to carry its own caveat (`suggestion-offered-without-its-ambiguity-caveat`).
// The two containers are labelled so the ambiguity list has a discriminator to print.
//
// **`Publish release` — enabled, and nothing else on the page is named anything like it.** This is
// the leg for a locator that *resolved*: `expect button "Publish release" is disabled` fails on the
// element's state, and answering it with a list of similar names is a diagnosis pointing away from
// the cause (`diagnosis-ignores-the-resolved-element`).
//
// **An icon-only button with no accessible name.** The unnamed arm exists for exactly this control:
// it is a real candidate that no name can reach, so a `button` miss surfaces it as a generated CSS
// path (`unnamed-arm-dropped-for-every-kind`). The same arm must NOT fire for `text`, whose scan is
// `*` — there it would answer with `css "html"` and its structural neighbours
// (`text-diagnosis-offers-structural-css-paths`, `M119-01`).
//
// **Twelve identical `Retire` rows.** The ambiguity list is capped, so twelve matches with one
// distinct label is the case that carries zero bits for the choice it demands the reader make —
// each row sits under its own labelled container so a discriminator exists to print
// (`ambiguity-list-without-discriminators`).
//
// Nothing on this page is clicked by the plant and nothing reacts. Every observation is a string in
// the report.
export function DiagnoseFixturePage() {
  const retired = ['Toronto', 'Lisbon', 'Osaka', 'Nairobi', 'Quito', 'Bergen', 'Dakar', 'Perth', 'Riga', 'Hobart', 'Cusco', 'Tromsø'];
  return (
    <section className="diagnose-fixture" aria-labelledby="diagnose-fixture-heading">
      <h1 id="diagnose-fixture-heading">Diagnose fixture</h1>

      <section aria-label="Quarterly report">
        <h2>Quarterly report</h2>
        <button type="button" data-testid="save-quarterly">Save draft</button>
        <button type="button" data-testid="publish-quarterly">Publish release</button>
        <button type="button" data-testid="pin-quarterly" className="icon-only">
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" focusable="false">
            <circle cx="6" cy="6" r="5" />
          </svg>
        </button>
      </section>

      <section aria-label="Annual report">
        <h2>Annual report</h2>
        <button type="button" data-testid="save-annual">Save draft</button>
      </section>

      <p data-testid="diagnose-prose">Inventory reconciled across every warehouse.</p>

      <ol data-group-list="retire">
        {retired.map((city) => (
          <li key={city} aria-label={`Region ${city}`}>
            <span>{city}</span>
            <button type="button" data-testid={`retire-${city.toLowerCase()}`}>Retire</button>
          </li>
        ))}
      </ol>
    </section>
  );
}
