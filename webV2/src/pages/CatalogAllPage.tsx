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
const FETCH_PAGE_SIZE = 100;

export function CatalogAllPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addOptimistic } = useCart();
  const { show } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PaginatedProducts>(`/products?page=1&pageSize=${FETCH_PAGE_SIZE}`)
      .then((result) => setProducts(result.data))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = filterText.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((p) => p.name.toLowerCase().includes(needle));
  }, [products, filterText]);

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
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          <div className="virtual-list-spacer" style={{ height: totalHeight }}>
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
    </section>
  );
}
