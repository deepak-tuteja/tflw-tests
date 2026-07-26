import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useCart } from '../cart/CartContext';
import { ProductQuickViewModal } from '../components/ProductQuickViewModal';
import { useToast } from '../toast/ToastContext';
import type { Category, PaginatedProducts, Product } from '../types';

const PAGE_SIZE = 12;

export function CatalogPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addOptimistic } = useCart();
  const { show } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PaginatedProducts | null>(null);
  const [loading, setLoading] = useState(true);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Category[]>('/categories').then(setCategories);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (categoryId) params.set('categoryId', categoryId);
    if (query) params.set('q', query);
    setLoading(true);
    apiFetch<PaginatedProducts>(`/products?${params.toString()}`)
      .then(setResult)
      .finally(() => setLoading(false));
  }, [categoryId, query, page]);

  async function handleRowAdd(product: Product) {
    if (!user) {
      navigate('/login', { state: { from: { pathname: '/' } } });
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
    <section aria-labelledby="catalog-heading">
      <h1 id="catalog-heading">Catalog</h1>
      <p>
        <Link to="/catalog/all">Browse all products (windowed list)</Link>
      </p>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
        }}
      >
        <div className="field">
          <label htmlFor="search">Search</label>
          <input
            id="search"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="category">Category</label>
          <select
            id="category"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </form>

      {loading && <p>Loading products…</p>}

      {!loading && result && (
        <>
          <ul className="product-grid">
            {result.data.map((product) => (
              <li key={product.id} className="product-row" aria-label={product.name}>
                <Link to={`/products/${product.id}`}>{product.name}</Link>
                <p className="price">${product.price}</p>
                <div className="product-row-actions">
                  {/*
                    Tier B corners (webV2-2): every row on this page renders the same two
                    controls with the same accessible name — 12 identical "Add to cart" buttons
                    and 12 identical "Quick view" buttons per page — forcing selectors to scope
                    `within` this row rather than pick the first match. "Add to cart"'s label is
                    also split across two <span>s (still one accessible name via concatenation,
                    but not a single text node) — a corner for anything that expects one node.
                  */}
                  <button
                    type="button"
                    onClick={() => handleRowAdd(product)}
                    disabled={addingId === product.id || product.stock === 0}
                  >
                    <span>Add</span> <span>to cart</span>
                  </button>
                  <button type="button" onClick={() => setQuickViewProduct(product)}>
                    Quick view
                  </button>
                  <Link to={`/products/${product.id}/reviews`}>Reviews</Link>
                </div>
              </li>
            ))}
          </ul>

          <nav aria-label="Pagination">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Previous
            </button>
            <span>
              Page {result.page} of {result.totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(result.totalPages, p + 1))}
              disabled={page >= result.totalPages}
            >
              Next
            </button>
          </nav>
        </>
      )}

      {quickViewProduct && (
        <ProductQuickViewModal
          product={quickViewProduct}
          onClose={() => setQuickViewProduct(null)}
        />
      )}
    </section>
  );
}
