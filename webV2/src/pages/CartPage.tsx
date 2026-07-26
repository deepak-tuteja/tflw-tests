import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, ApiError } from '../api/client';
import { useCart } from '../cart/CartContext';
import type { CartItem, Order } from '../types';

export function CartPage() {
  const { cart, refresh } = useCart();
  const navigate = useNavigate();
  const [couponCode, setCouponCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  // Tier C corner (webV2-3): drag-drop reorder. `order` is a purely client-side display order —
  // cart items have no backend position column, so dragging never persists across a refresh(); it
  // exists to exercise real HTML5 drag-and-drop (dragstart/dragover/drop), not to change checkout
  // semantics. New items are appended, removed ones drop out, on every cart change.
  const [order, setOrder] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    setOrder((prev) => {
      const currentIds = cart.items.map((item) => item.id);
      const kept = prev.filter((id) => currentIds.includes(id));
      const appended = currentIds.filter((id) => !kept.includes(id));
      return [...kept, ...appended];
    });
  }, [cart.items]);

  const orderedItems = order
    .map((id) => cart.items.find((item) => item.id === id))
    .filter((item): item is CartItem => Boolean(item));

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    setOrder((prev) => {
      const next = [...prev];
      const from = next.indexOf(dragId);
      const to = next.indexOf(targetId);
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
    setDragId(null);
  }

  // Tier C corner (webV2-3): iframe-embedded payment widget. `payment-widget.html` (webV2/public/)
  // is a same-origin static page with its own form; it postMessages { type: 'payment-authorized' }
  // to the parent once it's happy with the (fake) card details, and only then does Checkout enable.
  const [paymentAuthorized, setPaymentAuthorized] = useState(false);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if ((event.data as { type?: string } | undefined)?.type === 'payment-authorized') {
        setPaymentAuthorized(true);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

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
            <th scope="col">Reorder</th>
            <th scope="col">Product</th>
            <th scope="col">Quantity</th>
            <th scope="col">Price</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {orderedItems.map((item) => (
            <tr
              key={item.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(item.id)}
            >
              <td>
                <span
                  className="drag-handle"
                  draggable
                  onDragStart={() => setDragId(item.id)}
                  aria-label={`Drag to reorder ${item.product.name}`}
                >
                  ⠿
                </span>
              </td>
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

        <div className="field">
          <p id="payment-heading">Payment details</p>
          <iframe
            title="Payment"
            src="/payment-widget.html"
            className="payment-frame"
            aria-labelledby="payment-heading"
          />
          {!paymentAuthorized && <p>Authorize payment above to enable checkout.</p>}
        </div>

        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={checkingOut || !paymentAuthorized}>
          Checkout
        </button>
      </form>
    </section>
  );
}
