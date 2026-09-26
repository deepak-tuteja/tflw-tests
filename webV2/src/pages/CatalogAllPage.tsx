import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useCart } from '../cart/CartContext';
import { useToast } from '../toast/ToastContext';
import type { PaginatedProducts, Product } from '../types';

// Tier B corner (webV2-2): a virtualized/windowed list. All ~100 products are fetched once, but
// only the rows within (or just outside) the visible scroll window are ever mounted in the DOM —
// most rows genuinely don't exist as elements until scrolled into view. Hand-rolled (no
// react-window) so the windowing math is fully known: fixed ROW_HEIGHT, an OVERSCAN of rows
// rendered just past each edge, everything else represented only by spacer height.
const ROW_HEIGHT = 64;
const OVERSCAN = 4;
const VIEWPORT_HEIGHT = 480;
// `S-3a` (decision 16): the catalogue scrolls without end — it loads a page, and the next one when
// the reader nears the bottom, until the catalogue is exhausted. A filter asks the server (`?q=`)
// instead of searching what happens to be loaded, so a product on page 9 is one filter away.
const FETCH_PAGE_SIZE = 25;
const SEARCH_PAGE_SIZE = 100;

export function CatalogAllPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addOptimistic } = useCart();
  const { show } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState<Product[] | null>(null);
  const [filterText, setFilterText] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PaginatedProducts>(`/products?page=1&pageSize=${FETCH_PAGE_SIZE}`)
      .then((result) => {
        setProducts(result.data);
        setTotal(result.total);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const needle = filterText.trim();
    if (!needle) {
      setSearched(null);
      return;
    }
    let live = true;
    apiFetch<PaginatedProducts>(`/products?page=1&pageSize=${SEARCH_PAGE_SIZE}&q=${encodeURIComponent(needle)}`).then((result) => {
      // `q` is full-text search, which matches whole words only, so the hits are unioned with what is
      // already loaded and both are filtered by substring: a half-typed name still narrows the list.
      if (!live) return;
      const lower = needle.toLowerCase();
      const byId = new Map([...result.data, ...products].map((p) => [p.id, p]));
      setSearched([...byId.values()].filter((p) => p.name.toLowerCase().includes(lower)));
    });
    return () => {
      live = false;
    };
  }, [filterText, products]);

  const filtered = useMemo(() => searched ?? products, [products, searched]);
  const exhausted = products.length >= total;

  async function loadMore() {
    if (loadingMore || exhausted || searched !== null) return;
    setLoadingMore(true);
    try {
      const next = await apiFetch<PaginatedProducts>(`/products?page=${page + 1}&pageSize=${FETCH_PAGE_SIZE}`);
      setProducts((prev) => [...prev, ...next.data]);
      setPage(next.page);
      setTotal(next.total);
    } finally {
      setLoadingMore(false);
    }
  }

  const totalHeight = filtered.length * ROW_HEIGHT;
  const firstVisible = Math.floor(scrollTop / ROW_HEIGHT);
  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT);
  const startIndex = Math.max(0, firstVisible - OVERSCAN);
  const endIndex = Math.min(filtered.length, firstVisible + visibleCount + OVERSCAN);
  const visibleRows = filtered.slice(startIndex, endIndex);

  async function handleAdd(product: Product) {
    if (!user) {
      navigate('/login', { state: { from: { pathname: '/catalog/all' } } });
      return;
    }
    setAddingId(product.id);
    try {
      await addOptimistic(product.id, 1);
      show(`Added 1 × ${product.name} to your cart.`);
    } catch (err) {
      show(err instanceof ApiError ? err.message : 'could not add to cart', 'error');
    } finally {
      setAddingId(null);
    }
  }

  return (
    <section aria-labelledby="catalog-all-heading">
      <h1 id="catalog-all-heading">Browse all products</h1>

      {/*
        Tier B corner (webV2-2): a placeholder-only field. No <label>, no aria-label, no
        surrounding .field wrapper — the accessible name comes from nothing but the placeholder
        text, forcing tflw's `field` selector to fall all the way down its label-association
        cascade to a placeholder match.
      */}
      <input
        type="text"
        placeholder="Filter products…"
        value={filterText}
        onChange={(e) => setFilterText(e.target.value)}
      />

      {loading && <p>Loading products…</p>}

      {!loading && (
        <div
          className="virtual-list-viewport"
          style={{ height: VIEWPORT_HEIGHT }}
          onScroll={(e) => {
            const el = e.currentTarget;
            setScrollTop(el.scrollTop);
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2 * ROW_HEIGHT) void loadMore();
          }}
        >
          <div className="virtual-list-spacer" style={{ height: totalHeight }}>
            {/* `S-3a`: the list's end, always in the DOM (the rows are virtualised, so the last row
                is not) — scrolling it into view scrolls this viewport, and the handler above loads
                the next page. */}
            <div className="virtual-list-end" data-catalogue-end aria-hidden="true" style={{ top: Math.max(totalHeight - 1, 0) }} />
            {visibleRows.map((product, i) => {
              const index = startIndex + i;
              return (
                <div
                  key={product.id}
                  className="virtual-list-row"
                  aria-label={product.name}
                  style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
                >
                  <Link to={`/products/${product.id}`}>{product.name}</Link>
                  <span className="price">${product.price}</span>
                  <button
                    type="button"
                    onClick={() => handleAdd(product)}
                    disabled={addingId === product.id || product.stock === 0}
                  >
                    Add to cart
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {!loading && searched === null && (
        <p className="catalogue-count" aria-live="polite" data-catalogue-count>
          {loadingMore ? 'Loading more…' : exhausted ? `All ${total} products shown` : `Showing ${products.length} of ${total} — scroll for more`}
        </p>
      )}
    </section>
  );
}
