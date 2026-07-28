import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import type { Order } from '../types';

export function OrderConfirmationPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    apiFetch<Order>(`/orders/${id}`).then(setOrder);
  }, [id]);

  if (!order) return <p>Loading…</p>;

  const total = order.items.reduce(
    (sum, item) => sum + Number(item.unitPrice) * item.quantity,
    0,
  );

  return (
    <section aria-labelledby="order-heading">
      <h1 id="order-heading">Order confirmed</h1>
      <p>
        Order <strong>{order.id}</strong> — status: <strong>{order.status}</strong>
      </p>
      <table>
        <caption>Order items</caption>
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col">Quantity</th>
            <th scope="col">Unit price</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id}>
              <td>{item.product.name}</td>
              <td>{item.quantity}</td>
              <td>${item.unitPrice}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {order.discountAmount && <p>Discount applied: ${order.discountAmount}</p>}
      <p className="total">Total: ${total.toFixed(2)}</p>
      {/* M43 (PLAN_WEBV2_M40.md decision 5): GET /orders/:id/receipt (M32) was already real and
          owner-scoped, just unconsumed by any UI — nginx proxies /v1/* same-origin (webV2/nginx.conf),
          so the session cookie rides along on a plain navigation with no bearer token needed. */}
      <p>
        <a href={`/v1/orders/${order.id}/receipt`} target="_blank" rel="noopener noreferrer">
          View receipt (PDF)
        </a>
      </p>
    </section>
  );
}
