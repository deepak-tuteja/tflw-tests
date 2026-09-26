import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

// `S-3a` (decision 16): the promo page. nginx serves it under a strict Content-Security-Policy
// (`webV2/nginx.conf`, `location = /promo`: scripts and styles from this origin only), so an
// `expect no a11y violations` here runs where a scanner's injected script must still work — tflw's
// `M228-01` case. The clock ticks every second, which is the region a `matches snapshot … mask`
// paints over: without the mask no two captures of this page agree.
const OFFERS = [
  { name: 'Desk lamp', was: '49.00', now: '39.00' },
  { name: 'Notebook set', was: '18.00', now: '12.50' },
  { name: 'Wireless mouse', was: '29.00', now: '22.00' },
];

export function PromoPage() {
  const [now, setNow] = useState(() => new Date());
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section aria-labelledby="promo-heading" className="promo">
      <h1 id="promo-heading">This week&rsquo;s offers</h1>
      <p>Offers end Sunday at midnight. The time now:</p>
      {/* The board is what the snapshot journey captures: a fixed size, drawn by CSS, with no text
          but the clock — which is the region the mask paints over. Everything a font could move is
          outside it, so the masked capture is the same pixels on any Linux a browser build runs
          on (`S-3b`: the first baseline was the whole section, and Fedora and Ubuntu wrap its text
          to different heights under one platform key). */}
      <div className="promo-board" data-promo-board>
        <span className="promo-board-stripe" />
        <time dateTime={now.toISOString()} className="promo-clock" data-clock>
          {now.toLocaleTimeString('en-GB')}
        </time>
      </div>
      <table>
        <caption>Offers this week</caption>
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col">Was</th>
            <th scope="col">Now</th>
          </tr>
        </thead>
        <tbody>
          {OFFERS.map((offer) => (
            <tr key={offer.name}>
              <th scope="row">{offer.name}</th>
              <td>
                <s>${offer.was}</s>
              </td>
              <td>${offer.now}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="field">
        <input id="promo-subscribe" type="checkbox" checked={subscribed} onChange={(e) => setSubscribed(e.target.checked)} />
        <label htmlFor="promo-subscribe">Email me next week&rsquo;s offers</label>
      </div>
      {/* A live region without `role="status"`: the site-wide status colour (#27ae60 on white) is
          2.9:1, under AA's 4.5, and this page is held to an axe scan. */}
      <p aria-live="polite" data-subscribed>
        {subscribed ? 'You will hear about next week’s offers.' : 'You are not subscribed.'}
      </p>
      <p>
        <Link to="/catalog/all">Browse the whole catalogue</Link>
      </p>
    </section>
  );
}
