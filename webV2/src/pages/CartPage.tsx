import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, ApiError } from '../api/client';
import { useCart } from '../cart/CartContext';
import type { Order } from '../types';

export function CartPage() {
  const { cart, refresh } = useCart();
  const navigate = useNavigate();
  const [couponCode, setCouponCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  async function updateQuantity(itemId: string, quantity: number) {
    if (quantity < 1) return;
    await apiFetch(`/cart/items/${itemId}`, { method: 'PATCH', body: { quantity } });
    await refresh();
  }

  async function removeItem(itemId: string) {
    await apiFetch(`/cart/items/${itemId}`, { method: 'DELETE' });
    await refresh();
  }

  async function handleCheckout(event: FormEvent) {
    event.preventDefault();
    setCheckingOut(true);
    setError(null);
    try {
      const order = await apiFetch<Order>('/cart/checkout', {
        method: 'POST',
        body: couponCode ? { couponCode } : {},
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
      await refresh();
      navigate(`/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'checkout failed');
    } finally {
      setCheckingOut(false);
    }
  }

  const total = cart.items.reduce(
    (sum, item) => sum + Number(item.product.price) * item.quantity,
    0,
  );

  if (cart.items.length === 0) {
    return (
      <section aria-labelledby="cart-heading">
        <h1 id="cart-heading">Cart</h1>
        <p>Your cart is empty.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="cart-heading">
      <h1 id="cart-heading">Cart</h1>
      <table>
        <caption>Items in your cart</caption>
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col">Quantity</th>
            <th scope="col">Price</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {cart.items.map((item) => (
            <tr key={item.id}>
              <th scope="row">{item.product.name}</th>
              <td>
                <label htmlFor={`quantity-${item.id}`}>
                  Quantity for {item.product.name}
                </label>
                <input
                  id={`quantity-${item.id}`}
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateQuantity(item.id, Number(e.target.value))}
                />
              </td>
              <td>${(Number(item.product.price) * item.quantity).toFixed(2)}</td>
              <td>
                <button type="button" onClick={() => removeItem(item.id)}>
                  Remove {item.product.name}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="total">Total: ${total.toFixed(2)}</p>

      <form onSubmit={handleCheckout}>
        <div className="field">
          <label htmlFor="coupon-code">Coupon code</label>
          <input
            id="coupon-code"
            type="text"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value)}
          />
        </div>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={checkingOut}>
          Checkout
        </button>
      </form>
    </section>
  );
}
