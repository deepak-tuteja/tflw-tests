import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import '../components/starRatingElement';
import type { Product, Review, ReviewPage } from '../types';

const CHART_WIDTH = 260;
const CHART_HEIGHT = 150;
const CHART_PADDING = 24;

// Tier C corner (webV2-3): a <canvas> chart with nothing semantic underneath it — no table, no
// list, just pixels. Clicking a bar filters the review list below by hit-testing the click's x
// coordinate against each bar's drawn rectangle, the same way a real dashboard or seat-picker
// would. tflw has no notion of "click the bar for rating 4" beyond raw element/coordinate steps.
function drawHistogram(canvas: HTMLCanvasElement, counts: number[], selected: number | null) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
  const max = Math.max(1, ...counts);
  const barWidth = (CHART_WIDTH - CHART_PADDING) / counts.length;

  counts.forEach((count, i) => {
    const barHeight = (count / max) * (CHART_HEIGHT - CHART_PADDING);
    const x = CHART_PADDING + i * barWidth;
    const y = CHART_HEIGHT - CHART_PADDING - barHeight;
    ctx.fillStyle = selected === i + 1 ? '#f5a623' : '#5b8def';
    ctx.fillRect(x + 4, y, barWidth - 8, barHeight);
    ctx.fillStyle = 'currentColor';
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), x + barWidth / 2, CHART_HEIGHT - 6);
    ctx.fillText(String(count), x + barWidth / 2, y - 4);
  });
}

export function ProductReviewsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ratingEl, setRatingEl] = useState<(HTMLElement & { value: number }) | null>(null);
  const ratingRef = useCallback((node: (HTMLElement & { value: number }) | null) => {
    setRatingEl(node);
  }, []);

  useEffect(() => {
    apiFetch<Product>(`/products/${id}`).then(setProduct);
  }, [id]);

  async function loadReviews() {
    const page = await apiFetch<ReviewPage>(`/products/${id}/reviews?limit=50`);
    setReviews(page.data);
  }

  useEffect(() => {
    loadReviews();
  }, [id]);

  // Wire the shadow-DOM element's imperative `value` property + `ratingchange` custom event —
  // there is no React prop/handler pairing for a plain web component. `ratingEl` comes from a
  // callback ref (state, not a plain useRef) so this effect is guaranteed to run once the node is
  // actually attached, rather than racing a `useRef` + mount-effect pair against React's own
  // custom-element property reconciliation.
  useEffect(() => {
    if (!ratingEl) return;
    function handleChange(event: Event) {
      setRating((event as CustomEvent<{ value: number }>).detail.value);
    }
    ratingEl.addEventListener('ratingchange', handleChange);
    return () => ratingEl.removeEventListener('ratingchange', handleChange);
  }, [ratingEl]);

  useEffect(() => {
    if (ratingEl) ratingEl.value = rating;
  }, [ratingEl, rating]);

  const counts = useMemo(() => {
    const tally = [0, 0, 0, 0, 0];
    for (const review of reviews) tally[review.rating - 1] += 1;
    return tally;
  }, [reviews]);

  useEffect(() => {
    if (canvasRef.current) drawHistogram(canvasRef.current, counts, selectedRating);
  }, [counts, selectedRating]);

  function handleChartClick(event: MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * CHART_WIDTH;
    const barWidth = (CHART_WIDTH - CHART_PADDING) / counts.length;
    const index = Math.floor((x - CHART_PADDING) / barWidth);
    if (index < 0 || index >= counts.length) return;
    const clicked = index + 1;
    setSelectedRating((prev) => (prev === clicked ? null : clicked));
  }

  const visibleReviews = selectedRating
    ? reviews.filter((r) => r.rating === selectedRating)
    : reviews;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user) {
      navigate('/login', { state: { from: { pathname: `/products/${id}/reviews` } } });
      return;
    }
    if (rating < 1) {
      setError('pick a star rating first');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch(`/products/${id}/reviews`, {
        method: 'POST',
        body: { rating, comment: comment || undefined },
      });
      setRating(0);
      setComment('');
      await loadReviews();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not submit review');
    } finally {
      setSubmitting(false);
    }
  }

  if (!product) return <p>Loading…</p>;

  return (
    <section aria-labelledby="reviews-heading">
      <h1 id="reviews-heading">Reviews for {product.name}</h1>
      <p>
        <Link to={`/products/${product.id}`}>Back to product</Link>
      </p>

      <canvas
        ref={canvasRef}
        width={CHART_WIDTH}
        height={CHART_HEIGHT}
        className="rating-chart"
        onClick={handleChartClick}
        aria-label={`Rating distribution: click a bar to filter reviews by that star rating${
          selectedRating ? `, currently showing ${selectedRating} stars only` : ''
        }`}
      />
      {selectedRating && (
        <p>
          Showing {selectedRating}-star reviews only.{' '}
          <button type="button" onClick={() => setSelectedRating(null)}>
            Clear filter
          </button>
        </p>
      )}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <p id="rating-label">Your rating</p>
          <star-rating ref={ratingRef} aria-labelledby="rating-label" />
        </div>
        <div className="field">
          <label htmlFor="review-comment">Comment (optional)</label>
          <textarea
            id="review-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>
          Submit review
        </button>
      </form>

      <ul className="review-list">
        {visibleReviews.map((review) => (
          <li key={review.id}>
            <star-rating readonly value={review.rating} aria-label={`${review.rating} out of 5 stars`} />
            {review.comment && <p>{review.comment}</p>}
            {review.replyText && <p className="review-reply">Reply: {review.replyText}</p>}
          </li>
        ))}
        {visibleReviews.length === 0 && <li>No reviews yet.</li>}
      </ul>
    </section>
  );
}
