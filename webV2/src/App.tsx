import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { CartProvider } from './cart/CartContext';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ToastProvider } from './toast/ToastContext';
import { LoginPage } from './pages/LoginPage';
import { CatalogPage } from './pages/CatalogPage';
import { CatalogAllPage } from './pages/CatalogAllPage';
import { ProductPage } from './pages/ProductPage';
import { CartPage } from './pages/CartPage';
import { OrderConfirmationPage } from './pages/OrderConfirmationPage';

export function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <ToastProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<CatalogPage />} />
              <Route path="catalog/all" element={<CatalogAllPage />} />
              <Route path="products/:id" element={<ProductPage />} />
              <Route path="login" element={<LoginPage />} />
              <Route element={<ProtectedRoute />}>
                <Route path="cart" element={<CartPage />} />
                <Route path="orders/:id" element={<OrderConfirmationPage />} />
              </Route>
            </Route>
          </Routes>
        </ToastProvider>
      </CartProvider>
    </AuthProvider>
  );
}
