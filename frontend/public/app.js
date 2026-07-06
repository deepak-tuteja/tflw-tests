// Shared client-side helpers for the testFlow-tests frontend showcase.
export const AUTH_BASE = 'http://localhost:4002';
export const CORE_BASE = 'http://localhost:4001';

export async function loginSession(email, password) {
  const res = await fetch(`${AUTH_BASE}/auth/session-login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'login failed');
  // Also fetch a bearer token for calls to the core service's write endpoints —
  // a real app would keep a session cookie for page identity and a bearer
  // token for API calls; this mirrors that split.
  const bearerRes = await fetch(`${AUTH_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const { token } = await bearerRes.json();
  sessionStorage.setItem('tf_token', token);
  return res.json();
}

export async function fetchProfile() {
  const res = await fetch(`${AUTH_BASE}/auth/profile`, { credentials: 'include' });
  if (!res.ok) return null;
  return (await res.json()).user;
}

export async function logout() {
  await fetch(`${AUTH_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
  sessionStorage.removeItem('tf_token');
}

export function authHeaders() {
  const token = sessionStorage.getItem('tf_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

export async function requireLogin() {
  const user = await fetchProfile();
  if (!user) {
    window.location.href = '/index.html';
    return null;
  }
  return user;
}
