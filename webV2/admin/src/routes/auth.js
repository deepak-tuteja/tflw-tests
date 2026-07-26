import { Router } from 'express';
import { apiRequest, extractSessionCookie, ApiError } from '../apiClient.js';
import { asyncRoute } from '../asyncRoute.js';
import { verifyCsrf } from '../middleware/csrf.js';

const router = Router();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { error: null });
});

router.post(
  '/login',
  asyncRoute(async (req, res) => {
    const { email, password } = req.body;
    let login;
    try {
      login = await apiRequest(null, 'POST', '/auth/session-login', { email, password });
    } catch (err) {
      if (err instanceof ApiError) {
        return res.status(err.status).render('login', { error: err.problem?.detail ?? err.message });
      }
      throw err;
    }

    const sessionCookie = extractSessionCookie(login.setCookie);
    const auth = { sessionCookie, csrfToken: login.data.csrfToken };
    const profile = await apiRequest(auth, 'GET', '/auth/profile');

    // This console is for ADMIN/AGENT accounts only (the four domains it manages — moderation,
    // coupons, categories, tickets — are all admin/agent-facing on apiV2's side); a plain USER
    // logging in here would just see their own single ticket, which isn't what "admin console"
    // implies. Log them straight back out rather than half-admitting them.
    if (!['admin', 'agent'].includes(profile.data.role)) {
      await apiRequest(auth, 'POST', '/auth/session-logout');
      return res.status(403).render('login', {
        error: 'This console is for admin/agent accounts only.',
      });
    }

    req.session.auth = auth;
    req.session.user = {
      id: profile.data.id,
      name: profile.data.name,
      email: profile.data.email,
      role: profile.data.role,
    };
    res.redirect('/');
  }),
);

router.post(
  '/logout',
  verifyCsrf,
  asyncRoute(async (req, res) => {
    if (req.session.auth) {
      await apiRequest(req.session.auth, 'POST', '/auth/session-logout');
    }
    req.session.destroy(() => res.redirect('/login'));
  }),
);

export default router;
