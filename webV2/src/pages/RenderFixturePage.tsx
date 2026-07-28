import { useState } from 'react';

// M45 (PLAN_WEBV2_M45.md): a page built purely so tflw's `matches snapshot` dogfood test renders
// byte-identically on every machine — self-hosted `.render-fixture` font (styles.css), static text,
// no seeded/random data, no external image fetch (inline SVG, same pattern AccessibilityDemoPage
// already uses). Public route, no login, so there's no auth-rehydration race either.
export function RenderFixturePage() {
  const [subscribed, setSubscribed] = useState(false);

  return (
    <section className="render-fixture" aria-labelledby="render-fixture-heading">
      <h1 id="render-fixture-heading">Render fixture</h1>
      <p>Static content for visual-regression dogfood tests — nothing here ever changes.</p>
      <div className="field">
        <label htmlFor="render-fixture-checkbox">Subscribe to updates</label>
        <input
          id="render-fixture-checkbox"
          type="checkbox"
          checked={subscribed}
          onChange={(e) => setSubscribed(e.target.checked)}
        />
      </div>
      <button type="button" className="render-fixture-button">
        Save preferences
      </button>
      <img
        src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='10' fill='%235b8def'/%3E%3C/svg%3E"
        alt="A blue circle representing an active status"
      />
    </section>
  );
}
