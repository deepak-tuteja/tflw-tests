import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useCart } from '../cart/CartContext';
import type { Product } from '../types';

export function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refresh } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Product>(`/products/${id}`).then(setProduct);
  }, [id]);

  async function handleAddToCart() {
    if (!product) return;
    if (!user) {
      navigate('/login', { state: { from: { pathname: `/products/${product.id}` } } });
      return;
    }
    setError(null);
    setStatus(null);
    try {
      await apiFetch('/cart/items', {
        method: 'POST',
        body: { productId: product.id, quantity },
      });
      await refresh();
      setStatus(`Added ${quantity} × ${product.name} to your cart.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not add to cart');
    }
  }

  if (!product) return <p>Loading…</p>;

  return (
    <section aria-labelledby="product-heading">
      <h1 id="product-heading">{product.name}</h1>
      <p>{product.description}</p>
      <p className="price">${product.price}</p>
      <p>{product.stock} in stock</p>

      <div className="field">
        <label htmlFor="quantity">Quantity</label>
        <input
          id="quantity"
          type="number"
          min={1}
          max={product.stock}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
        />
      </div>

      <button type="button" onClick={handleAddToCart} disabled={product.stock === 0}>
        Add to cart
      </button>

      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
