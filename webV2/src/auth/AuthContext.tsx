import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch, setCsrfToken, ApiError } from '../api/client';
import type { Profile } from '../types';

interface AuthState {
  user: Profile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // The `session` cookie survives a page reload; the csrfToken kept in sessionStorage (set by
  // `login`) does too within the same tab. If either is missing, `profile` still succeeds off the
  // cookie alone (GET isn't CSRF-checked) but a later mutating action will 403 until the user
  // logs in again — acceptable for this scaffold, not a real refresh flow yet.
  useEffect(() => {
    apiFetch<Profile>('/auth/profile')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const { csrfToken } = await apiFetch<{ userId: string; csrfToken: string }>(
      '/auth/session-login',
      { method: 'POST', body: { email, password } },
    );
    setCsrfToken(csrfToken);
    const profile = await apiFetch<Profile>('/auth/profile');
    setUser(profile);
  }

  async function logout() {
    try {
      await apiFetch('/auth/session-logout', { method: 'POST' });
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
    } finally {
      setCsrfToken(null);
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
