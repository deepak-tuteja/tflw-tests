import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useCart } from '../cart/CartContext';
import { useToast } from '../toast/ToastContext';
import type { Product } from '../types';

// Tier B corner (webV2-2, PLAN_WEBV2_TARGETS.md): a modal with a real focus trap. Hand-rolled
// (no focus-trap library) so the behavior is fully known: focus moves into the dialog on open,
// Tab/Shift+Tab wrap at the dialog's own boundary instead of escaping to the page behind it,
// Escape closes it, and focus is restored to whatever triggered the modal on close.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  product: Product;
  onClose: () => void;
}

export function ProductQuickViewModal({ product, onClose }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addOptimistic } = useCart();
  const { show } = useToast();
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    return () => {
      previouslyFocused.current?.focus();
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function handleAdd() {
    if (!user) {
      navigate('/login', { state: { from: { pathname: `/products/${product.id}` } } });
      return;
    }
    setError(null);
    setAdding(true);
    try {
      await addOptimistic(product.id, quantity);
      show(`Added ${quantity} × ${product.name} to your cart.`);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not add to cart');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-view-heading"
        onKeyDown={handleKeyDown}
      >
        <h2 id="quick-view-heading">{product.name}</h2>
        <p>{product.description}</p>
        <p className="price">${product.price}</p>
        <p>{product.stock} in stock</p>

        <div className="field">
          <label htmlFor="quick-view-quantity">Quantity</label>
          <input
            id="quick-view-quantity"
            type="number"
            min={1}
            max={product.stock}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
          />
        </div>

        {error && <p role="alert">{error}</p>}

        <div className="modal-actions">
          <button type="button" onClick={handleAdd} disabled={adding || product.stock === 0}>
            Add to cart
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
