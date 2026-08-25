import { useState } from 'react';

// `M154d` (testFlow `PLAN_M154_DOGFOOD_CONFORMANCE.md`, `D722`/`D729`): the near-miss harness for
// tflw's six locators.
//
// ## Why this is a harness page and not a real flow
//
// `D729` orders real flows first and this page is the fallback it allows, for a reason specific to
// locators: what a locator plant has to grade is that the locator resolved **this** element and not
// a plausible neighbour, and that needs a *deliberate* near-miss — a link wearing a button's text, a
// placeholder colliding with another field's label, four identical buttons where only the third is
// the answer. A storefront that shipped those collisions would be a bug in the storefront. The
// precedent is `RenderFixturePage.tsx` (M45), which exists for the same shape of reason: a
// dogfood assertion that cannot be made stable against a page built for humans.
//
// Same rules as that page — public route, static markup, no seeded or random data, nothing that
// varies by machine.
//
// ## How a wrong resolution is observed
//
// Every candidate below — the true target *and* every decoy — writes its own token into the single
// `#locator-readout` element when it is interacted with. The test asserts the token. So a locator
// that resolves a decoy does not fail by not-found: it fails by reporting **the decoy's token**,
// which is the only way to tell "resolved the right element" from "resolved something".
//
// The handlers call `stopPropagation` so a click on a nested candidate cannot be credited to its
// container as well.
export function LocatorFixturePage() {
  const [token, setToken] = useState<string>('none');
  const [shipTo, setShipTo] = useState('');
  const [placeholderDecoy, setPlaceholderDecoy] = useState('UNTOUCHED');

  const mark = (value: string) => (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setToken(value);
  };

  return (
    <section className="locator-fixture" aria-labelledby="locator-fixture-heading">
      <h1 id="locator-fixture-heading">Locator fixture</h1>
      <p>
        Deliberate near-misses for tflw&apos;s six locators. Nothing here is a storefront feature.
      </p>

      {/* The single observation point. `data-token` is what the plant asserts, not the text. */}
      <output id="locator-readout" data-token={token}>
        {token}
      </output>

      {/*
        button — resolves by ROLE. Every decoy carries the same accessible text and a different
        role, so a `button` locator that had degenerated into a text search would either go
        ambiguous (tflw hard-errors on N>1) or land on a decoy and report its token.
      */}
      <div data-group="button">
        <h2>Role, not text</h2>
        <button type="button" onClick={mark('button/true')}>
          Archive shipment
        </button>
        <a href="#archive" onClick={mark('button/decoy-link')}>
          Archive shipment
        </a>
        <span role="menuitem" tabIndex={0} onClick={mark('button/decoy-menuitem')}>
          Archive shipment
        </span>
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div onClick={mark('button/decoy-div')}>Archive shipment</div>
      </div>

      {/*
        text — resolves by rendered TEXT CONTENT, not by attributes. Each decoy carries the phrase
        somewhere a content match must not see: an input's `value`, an image's `alt`, a `title`, an
        `aria-label`. If any of those started matching, the step goes red on ambiguity.

        The decoy input is deliberately `type="text"`: Playwright's text engine matches
        `input[type=button]` and `input[type=submit]` by their `value` **by design**, so making this
        one a submit would turn a correct engine red. Do not "fix" it.
      */}
      <div data-group="text">
        <h2>Content, not attributes</h2>
        <p onClick={mark('text/true')}>Restock queued</p>
        <input type="text" readOnly value="Restock queued" aria-label="Decoy carrying the phrase in a value" />
        <img
          src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Crect width='16' height='16' fill='%23888'/%3E%3C/svg%3E"
          alt="Restock queued"
        />
        <span title="Restock queued">A decoy carrying the phrase in a title</span>
        <button type="button" aria-label="Restock queued" onClick={mark('text/decoy-aria-label')}>
          A decoy carrying the phrase in an aria-label
        </button>
      </div>

      {/*
        field — the closed three-step cascade of `D6`: label, then placeholder, then role=textbox,
        in that fixed priority. Two inputs answer to "Ship to", one by its <label> and one by its
        placeholder. The cascade says the label wins. Nothing in this repository graded that order
        before, and an order that flipped would still pass every existing `fill field` in the suite.

        The placeholder decoy starts with a value rather than empty, so "was not filled" is a
        positive observation instead of an assertion about an empty string.
      */}
      <div data-group="field">
        <h2>Label beats placeholder</h2>
        <label htmlFor="field-by-label">Ship to</label>
        <input id="field-by-label" value={shipTo} onChange={(e) => setShipTo(e.target.value)} />
        <input
          id="field-by-placeholder"
          placeholder="Ship to"
          aria-label="Decoy answering to a placeholder"
          value={placeholderDecoy}
          onChange={(e) => setPlaceholderDecoy(e.target.value)}
        />
      </div>

      {/*
        list — resolves a role=list by its ACCESSIBLE NAME, and is the scope `within` narrows to.
        Both lists contain a button with the identical name "Remove", so an unscoped click on it is
        ambiguous by construction: the pair of assertions can only pass if `list` picked the named
        list AND `within` actually confined the search to it.
      */}
      <div data-group="list">
        <h2>The named list, and the scope it provides</h2>
        <ul aria-label="Backordered items">
          <li>
            Item A <button type="button" onClick={mark('list/items')}>Remove</button>
          </li>
        </ul>
        <ul aria-label="Backordered suppliers">
          <li>
            Supplier A <button type="button" onClick={mark('list/suppliers')}>Remove</button>
          </li>
        </ul>
      </div>

      {/*
        css — a structural selector whose answer is positional. Four identical buttons; only
        `:nth-child(3)` is right. A resolution that quietly took the first match reports `css/1`.
      */}
      <div data-group="css">
        <h2>Position, among identical siblings</h2>
        <ol data-group-list="css">
          {[1, 2, 3, 4].map((n) => (
            <li key={n}>
              <button type="button" onClick={mark(`css/${n}`)}>
                Select tier
              </button>
            </li>
          ))}
        </ol>
      </div>

      {/*
        xpath — the same shape, answered by an expression CSS cannot express, and deliberately one
        that does **not** start with `//`. Playwright auto-detects a selector beginning with `//` or
        `..` as XPath, so an implementation that forgot to prefix `xpath=` would still pass a test
        written the usual way. A leading `(` defeats that: this expression only resolves because
        `browser.ts` prefixes it. `last()` is the second half — CSS has no `:last-child` equivalent
        that composes with the grouping parenthesis.
      */}
      <div data-group="xpath">
        <h2>An expression CSS cannot express</h2>
        <ol data-group-list="xpath">
          {[1, 2, 3, 4].map((n) => (
            <li key={n}>
              <button type="button" onClick={mark(`xpath/${n}`)}>
                Choose region
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
