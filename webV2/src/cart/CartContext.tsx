import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Cart } from '../types';

interface CartState {
  cart: Cart;
  itemCount: number;
  refresh: () => Promise<void>;
  addOptimistic: (productId: string, quantity: number) => Promise<void>;
}

const EMPTY_CART: Cart = { id: null, items: [] };

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  // Tier B corner (webV2-2): optimistic UI that flips then corrects. `pendingDelta` is added to
  // the displayed count the instant the user clicks "Add to cart", before the network round trip
  // even starts. On the happy path the real POST + refresh() lands *while pendingDelta is still
  // applied*, so the header briefly overcounts by `quantity` before the `finally` below removes
  // the optimistic delta and the true server count is all that's left — a visible bump-then-settle,
  // not a fabricated one. On a failed request pendingDelta is removed without ever calling
  // refresh(), so the bump simply reverts.
  const [pendingDelta, setPendingDelta] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) {
      setCart(EMPTY_CART);
      return;
    }
    const fresh = await apiFetch<Cart>('/cart');
    setCart(fresh);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addOptimistic = useCallback(
    async (productId: string, quantity: number) => {
      setPendingDelta((d) => d + quantity);
      try {
        await apiFetch('/cart/items', { method: 'POST', body: { productId, quantity } });
        await refresh();
      } finally {
        setPendingDelta((d) => d - quantity);
      }
    },
    [refresh],
  );

  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0) + pendingDelta;

  return (
    <CartContext.Provider value={{ cart, itemCount, refresh, addOptimistic }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
