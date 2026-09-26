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
import { RenderFixturePage } from './pages/RenderFixturePage';
import { LocatorFixturePage } from './pages/LocatorFixturePage';
import { StepFixturePage } from './pages/StepFixturePage';
import { DiagnoseFixturePage } from './pages/DiagnoseFixturePage';
import { WaitFixturePage } from './pages/WaitFixturePage';
import { AccountPage } from './pages/AccountPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { ComparePage } from './pages/ComparePage';
import { PromoPage } from './pages/PromoPage';
import { TrackingPage } from './pages/TrackingPage';
import { WishlistPage } from './pages/WishlistPage';

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
              <Route path="render-fixture" element={<RenderFixturePage />} />
              <Route path="locator-fixture" element={<LocatorFixturePage />} />
              <Route path="step-fixture" element={<StepFixturePage />} />
              <Route path="diagnose-fixture" element={<DiagnoseFixturePage />} />
              <Route path="wait-fixture" element={<WaitFixturePage />} />
              {/* `S-3a` (decision 16): the storefront's surfaces a user lands on. */}
              <Route path="compare" element={<ComparePage />} />
              <Route path="promo" element={<PromoPage />} />
              <Route element={<ProtectedRoute />}>
                <Route path="cart" element={<CartPage />} />
                <Route path="orders/:id" element={<OrderConfirmationPage />} />
                <Route path="support" element={<SupportPage />} />
                <Route path="account" element={<AccountPage />} />
                <Route path="wishlist" element={<WishlistPage />} />
                <Route path="checkout" element={<CheckoutPage />} />
                <Route path="orders/:id/tracking" element={<TrackingPage />} />
              </Route>
            </Route>
          </Routes>
        </ToastProvider>
      </CartProvider>
    </AuthProvider>
  );
}
