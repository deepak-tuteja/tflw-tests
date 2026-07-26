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
import { ProductReviewsPage } from './pages/ProductReviewsPage';
import { CartPage } from './pages/CartPage';
import { OrderConfirmationPage } from './pages/OrderConfirmationPage';
import { SupportPage } from './pages/SupportPage';
import { AccessibilityDemoPage } from './pages/AccessibilityDemoPage';

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
              <Route path="products/:id/reviews" element={<ProductReviewsPage />} />
              <Route path="login" element={<LoginPage />} />
              <Route path="a11y-demo" element={<AccessibilityDemoPage />} />
              <Route element={<ProtectedRoute />}>
                <Route path="cart" element={<CartPage />} />
                <Route path="orders/:id" element={<OrderConfirmationPage />} />
                <Route path="support" element={<SupportPage />} />
              </Route>
            </Route>
          </Routes>
        </ToastProvider>
      </CartProvider>
    </AuthProvider>
  );
}
