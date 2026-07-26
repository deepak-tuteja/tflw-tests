import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useCart } from '../cart/CartContext';

export function Layout() {
  const { user, logout } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <header>
        <nav aria-label="Main">
          <Link to="/" className="brand">
            testFlow-tests storefront
          </Link>
          <Link to="/cart">Cart ({itemCount})</Link>
          {user ? (
            <>
              <span className="current-user">{user.email}</span>
              <button type="button" onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : (
            <Link to="/login">Log in</Link>
          )}
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
