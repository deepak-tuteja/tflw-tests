import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';
import type { Category, PaginatedProducts } from '../types';

const PAGE_SIZE = 12;

export function CatalogPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PaginatedProducts | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <section aria-labelledby="catalog-heading">
      <h1 id="catalog-heading">Catalog</h1>
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
              <li key={product.id}>
                <Link to={`/products/${product.id}`}>{product.name}</Link>
                <p className="price">${product.price}</p>
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
    </section>
  );
}
