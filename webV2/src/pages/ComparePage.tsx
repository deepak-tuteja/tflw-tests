import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import type { PaginatedProducts, Product } from '../types';

// `S-3a` (decision 16): the comparison a product page opens in a new tab. The product it came from
// is fixed by `?ids=`; the reader finds the one to set beside it by name (`?q=`), since the
// catalogue's first page by name is a hundred bulk items long.
export function ComparePage() {
  const [params] = useSearchParams();
  const firstId = params.get('ids')?.split(',')[0] ?? '';
  const [first, setFirst] = useState<Product | null>(null);
  const [choices, setChoices] = useState<Product[]>([]);
  const [secondId, setSecondId] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (firstId) apiFetch<Product>(`/products/${firstId}`).then(setFirst);
  }, [firstId]);

  useEffect(() => {
    const q = query.trim();
    const path = q ? `/products?page=1&pageSize=20&q=${encodeURIComponent(q)}` : '/products?page=1&pageSize=20&sort=name';
    apiFetch<PaginatedProducts>(path).then((result) => {
      const others = result.data.filter((p) => p.id !== firstId);
      setChoices(others);
      setSecondId(others[0]?.id ?? '');
    });
  }, [firstId, query]);

  const second = choices.find((p) => p.id === secondId) ?? null;

  return (
    <section aria-labelledby="compare-heading">
      <h1 id="compare-heading">Compare products</h1>
      <div className="field">
        <label htmlFor="compare-find">Find a product to compare</label>
        <input id="compare-find" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="compare-with">Compare with</label>
        <select id="compare-with" value={secondId} onChange={(e) => setSecondId(e.target.value)}>
          {choices.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {first && second ? (
        <table data-compare>
          <caption>Side by side</caption>
          <thead>
            <tr>
              <th scope="col">Attribute</th>
              <th scope="col">{first.name}</th>
              <th scope="col">{second.name}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Price</th>
              <td>${first.price}</td>
              <td>${second.price}</td>
            </tr>
            <tr>
              <th scope="row">In stock</th>
              <td>{first.stock}</td>
              <td>{second.stock}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p>Loading the comparison…</p>
      )}
    </section>
  );
}
