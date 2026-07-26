import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Cart } from '../types';

interface CartState {
  cart: Cart;
  itemCount: number;
  refresh: () => Promise<void>;
}

const EMPTY_CART: Cart = { id: null, items: [] };

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cart, setCart] = useState<Cart>(EMPTY_CART);

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

  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{ cart, itemCount, refresh }}>{children}</CartContext.Provider>
  );
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
