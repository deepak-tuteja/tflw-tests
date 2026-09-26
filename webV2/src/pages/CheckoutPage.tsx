import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiFetch } from '../api/client';
import { useCart } from '../cart/CartContext';
import type { Order } from '../types';

// `S-3a` (decision 16): a checkout a keyboard can finish. A skip link is the first stop, the fields
// come in reading order, and Enter in any field submits — nothing here needs a pointer. The order
// is placed through the same `POST /cart/checkout` the cart page uses.
export function CheckoutPage() {
  const navigate = useNavigate();
  const { refresh } = useCart();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !email.trim() || !address.trim()) {
      setError('Fill in your name, email and address to place the order.');
      return;
    }
    setPlacing(true);
    setError(null);
    try {
      const order = await apiFetch<Order>('/cart/checkout', {
        method: 'POST',
        body: {},
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
      await refresh();
      navigate(`/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'checkout failed');
    } finally {
      setPlacing(false);
    }
  }

  return (
    <section aria-labelledby="checkout-heading">
      <a href="#checkout-form" className="skip-link">
        Skip to the checkout form
      </a>
      <h1 id="checkout-heading">Checkout</h1>
      <p>Everything on this page works from the keyboard: Tab through the fields and press Enter to place the order.</p>
      <form id="checkout-form" tabIndex={-1} onSubmit={handleSubmit} aria-label="Checkout">
        <div className="field">
          <label htmlFor="checkout-name">Full name</label>
          <input id="checkout-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="checkout-email">Email</label>
          <input id="checkout-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="checkout-address">Delivery address</label>
          <input id="checkout-address" autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="error" data-checkout-error>
            {error}
          </p>
        )}
        <button type="submit" disabled={placing}>
          {placing ? 'Placing your order…' : 'Place order'}
        </button>
      </form>
    </section>
  );
}
