import { useEffect, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { PaginatedProducts, Product } from '../types';

// `S-3a` (decision 16): the wishlist, the storefront's pointer-gesture surface. Rows reorder by
// dragging their handle; a right click opens the row's own menu (move to top, remove); a double
// click pins a row. It lives in this browser, per signed-in user, and starts from four products
// the seed always has, by name — the catalogue's first page moves as other tests add products, and a
// journey needs to know what it will find. The server has no wishlist, and a journey needs none.
interface Wish {
  id: string;
  name: string;
  price: string;
  pinned: boolean;
}

const SEED_NAMES = ['Wireless Mouse', 'Mechanical Keyboard', 'The Pragmatic Programmer', 'Clean Code'];

function storageKey(email: string | undefined): string {
  return `webv2.wishlist.${email ?? 'anonymous'}`;
}

export function WishlistPage() {
  const { user } = useAuth();
  const [wishes, setWishes] = useState<Wish[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey(user?.email));
    if (saved) {
      setWishes(JSON.parse(saved) as Wish[]);
      return;
    }
    Promise.all(
      SEED_NAMES.map((name) =>
        apiFetch<PaginatedProducts>(`/products?page=1&pageSize=5&q=${encodeURIComponent(name)}`).then((result) =>
          result.data.find((p: Product) => p.name === name),
        ),
      ),
    ).then((found) =>
      setWishes(
        found
          .filter((p): p is Product => p !== undefined)
          .map((p) => ({ id: p.id, name: p.name, price: String(p.price), pinned: false })),
      ),
    );
  }, [user?.email]);

  useEffect(() => {
    if (wishes) sessionStorage.setItem(storageKey(user?.email), JSON.stringify(wishes));
  }, [wishes, user?.email]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', close);
    };
  }, [menu]);

  function move(id: string, toIndex: number) {
    setWishes((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const from = next.findIndex((w) => w.id === id);
      const [item] = next.splice(from, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  }

  function handleDrop(targetId: string) {
    if (!wishes || !dragId || dragId === targetId) return;
    move(dragId, wishes.findIndex((w) => w.id === targetId));
    setDragId(null);
  }

  function openMenu(event: MouseEvent, id: string) {
    event.preventDefault();
    setMenu({ id, x: event.clientX, y: event.clientY });
  }

  if (!wishes) return <p>Loading your wishlist…</p>;

  const menuWish = menu ? wishes.find((w) => w.id === menu.id) : undefined;

  return (
    <section aria-labelledby="wishlist-heading">
      <h1 id="wishlist-heading">Wishlist</h1>
      <p>Drag a row by its handle to reorder, right-click a row for its menu, double-click a row to pin it.</p>
      {wishes.length === 0 ? (
        <p data-wishlist-empty>Your wishlist is empty.</p>
      ) : (
        <ol className="wishlist" aria-label="Wishlist items">
          {wishes.map((wish) => (
            <li
              key={wish.id}
              className={wish.pinned ? 'wish pinned' : 'wish'}
              data-wish={wish.name}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(wish.id)}
              onContextMenu={(e) => openMenu(e, wish.id)}
              onDoubleClick={() =>
                setWishes((prev) => prev && prev.map((w) => (w.id === wish.id ? { ...w, pinned: !w.pinned } : w)))
              }
            >
              <span
                className="drag-handle"
                draggable
                onDragStart={() => setDragId(wish.id)}
                aria-label={`Drag to reorder ${wish.name}`}
              >
                ⠿
              </span>
              <Link to={`/products/${wish.id}`}>{wish.name}</Link>
              <span className="price">${wish.price}</span>
              {wish.pinned && <span className="badge" data-pinned>Pinned</span>}
            </li>
          ))}
        </ol>
      )}
      {menu && menuWish && (
        <div role="menu" aria-label={`Actions for ${menuWish.name}`} className="context-menu" style={{ left: menu.x, top: menu.y }}>
          <button type="button" role="menuitem" onClick={() => move(menuWish.id, 0)}>
            Move to top
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => setWishes((prev) => prev && prev.filter((w) => w.id !== menuWish.id))}
          >
            Remove from wishlist
          </button>
        </div>
      )}
    </section>
  );
}
