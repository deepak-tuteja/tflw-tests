import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ApiError, apiFetch } from '../api/client';

// `S-3a` (decision 16): the order-tracking page, which is slow on purpose. `?delayMs=` is passed to
// the server, which holds its answer back, so the page shows a loading state for as long as the
// server asks — the surface a `wait until` and a step timeout are written against.
interface Tracking {
  orderId: string;
  status: string;
  events: { at: string; label: string }[];
  delayedMs: number;
}

export function TrackingPage() {
  const { id } = useParams<{ id: string }>();
  const { search } = useLocation();
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const delayMs = new URLSearchParams(search).get('delayMs');
    const query = delayMs ? `?delayMs=${encodeURIComponent(delayMs)}` : '';
    apiFetch<Tracking>(`/orders/${id}/tracking${query}`)
      .then(setTracking)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'tracking failed'));
  }, [id, search]);

  return (
    <section aria-labelledby="tracking-heading">
      <h1 id="tracking-heading">Track your order</h1>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!tracking && !error && (
        <p aria-live="polite" data-tracking-loading>
          Asking the carrier where your order is…
        </p>
      )}
      {tracking && (
        <>
          <p data-tracking-status>
            Status: <strong>{tracking.status}</strong>
          </p>
          <ol aria-label="Tracking events">
            {tracking.events.map((e) => (
              <li key={e.label}>{e.label}</li>
            ))}
          </ol>
        </>
      )}
      <p>
        <a href={`/v1/orders/${id}/receipt`} download={`invoice-${id}.pdf`}>
          Download the invoice
        </a>
      </p>
      <p>
        <Link to={`/orders/${id}`}>Back to the order</Link>
      </p>
    </section>
  );
}
