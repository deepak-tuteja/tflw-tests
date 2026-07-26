import { useState } from 'react';

// a11y flag corner (webV2-3, PLAN_WEBV2_TARGETS.md §1.3): an accessible twin next to a
// deliberately inaccessible one, so a future axe-core-driven `tflw scan` has real violations to
// assert on in one half and "no violations" to demonstrate in the other. The inaccessible half is
// gated behind a build-time flag (Vite's VITE_ENABLE_A11Y_VIOLATIONS, threaded through
// webV2/Dockerfile's ARG and docker-compose.yml's build.args) rather than a runtime toggle, so
// disabling it produces an actually-clean build rather than clean-looking markup that still
// shipped the violations to the client.
const VIOLATIONS_ENABLED = import.meta.env.VITE_ENABLE_A11Y_VIOLATIONS !== 'false';

export function AccessibilityDemoPage() {
  const [accessibleChecked, setAccessibleChecked] = useState(false);
  const [inaccessibleChecked, setInaccessibleChecked] = useState(false);

  return (
    <section aria-labelledby="a11y-heading">
      <h1 id="a11y-heading">Accessibility demo</h1>

      <section aria-labelledby="a11y-accessible-heading">
        <h2 id="a11y-accessible-heading">Accessible variant</h2>
        <div className="field">
          <label htmlFor="a11y-accessible-checkbox">Subscribe to updates</label>
          <input
            id="a11y-accessible-checkbox"
            type="checkbox"
            checked={accessibleChecked}
            onChange={(e) => setAccessibleChecked(e.target.checked)}
          />
        </div>
        <button type="button" className="a11y-accessible-button">
          Save preferences
        </button>
        <img
          src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='10' fill='%235b8def'/%3E%3C/svg%3E"
          alt="A blue circle representing an active status"
        />
      </section>

      {VIOLATIONS_ENABLED && (
        <section aria-labelledby="a11y-inaccessible-heading">
          <h2 id="a11y-inaccessible-heading">Inaccessible variant</h2>
          {/*
            Deliberate violations, each a distinct axe-core rule: an input with no label and no
            aria-label anywhere (unlike webV2-2's placeholder-only field, this one has no
            accessible name at all); a clickable <div> standing in for a button with no role, no
            tabindex, and no keyboard handler; low-contrast text; an <img> with no alt attribute.
          */}
          <input
            type="checkbox"
            checked={inaccessibleChecked}
            onChange={(e) => setInaccessibleChecked(e.target.checked)}
          />
          <div className="a11y-fake-button" onClick={() => setInaccessibleChecked((v) => !v)}>
            Save preferences
          </div>
          <p className="a11y-low-contrast">
            This text fails WCAG contrast requirements against its background.
          </p>
          <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='10' fill='%235b8def'/%3E%3C/svg%3E" />
        </section>
      )}
    </section>
  );
}
