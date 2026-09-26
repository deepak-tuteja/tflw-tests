import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';
import type { Category } from '../types';

// `S-3a` (decision 16): the header's mega-menu. It opens when the pointer rests on "Shop" and when
// the button is focused or pressed, so a `hover` journey and a keyboard reach the same panel; it
// closes when the pointer leaves the whole menu, or on Escape. The panel is rendered only while open:
// a hidden panel is still text on the page, and a test's `text "Catalog"` would match its links.
export function ShopMenu() {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<Category[]>('/categories')
      .then((all) => setCategories(all.filter((c) => c.parentId === null)))
      .catch(() => setCategories([]));
  }, []);

  return (
    <div
      className="shop-menu"
      ref={root}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
      onBlur={(e) => {
        if (!root.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button type="button" aria-expanded={open} onClick={() => setOpen(true)} onFocus={() => setOpen(true)}>
        Shop
      </button>
      {open && (
      <div id="shop-menu-panel" className="shop-menu-panel" data-shop-menu>
        <nav aria-label="Shop">
          <h2 className="shop-menu-title">Categories</h2>
          <ul>
            {categories.map((c) => (
              <li key={c.id}>
                <Link to={`/?category=${c.id}`} onClick={() => setOpen(false)}>
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
          <h2 className="shop-menu-title">More</h2>
          <ul>
            <li>
              <Link to="/catalog/all" onClick={() => setOpen(false)}>
                Every product
              </Link>
            </li>
            <li>
              <Link to="/promo" onClick={() => setOpen(false)}>
                This week&rsquo;s offers
              </Link>
            </li>
            <li>
              <Link to="/wishlist" onClick={() => setOpen(false)}>
                Your wishlist
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      )}
    </div>
  );
}
