import { Router } from 'express';
import { apiRequest, ApiError } from '../apiClient.js';
import { asyncRoute } from '../asyncRoute.js';
import { verifyCsrf } from '../middleware/csrf.js';
import { requireRole } from '../middleware/requireAuth.js';

// PLAN_ENTERPRISE_REGRESSION.md E3 — org/membership management, same guard as coupons.js
// (`requireRole('admin')`, system role): a customer org's own owner/admin never logs into this
// console — their elevated visibility into their org's orders/tickets/coupons happens entirely
// through those resources' own storefront-facing endpoints, not here.
const router = Router();
router.use(requireRole('admin'));

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const { data: orgs } = await apiRequest(req.session.auth, 'GET', '/orgs');
    res.render('orgs/list', { orgs, error: null });
  }),
);

router.post(
  '/',
  verifyCsrf,
  asyncRoute(async (req, res) => {
    const { name, plan } = req.body;
    try {
      await apiRequest(req.session.auth, 'POST', '/orgs', { name, plan });
    } catch (err) {
      if (err instanceof ApiError) {
        const { data: orgs } = await apiRequest(req.session.auth, 'GET', '/orgs');
        return res.status(err.status).render('orgs/list', {
          orgs,
          error: err.problem?.detail ?? err.message,
        });
      }
      throw err;
    }
    res.redirect('/orgs');
  }),
);

router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const [{ data: org }, { data: members }] = await Promise.all([
      apiRequest(req.session.auth, 'GET', `/orgs/${req.params.id}`),
      apiRequest(req.session.auth, 'GET', `/orgs/${req.params.id}/memberships`),
    ]);
    res.render('orgs/detail', { org, members, error: null });
  }),
);

router.post(
  '/:id',
  verifyCsrf,
  asyncRoute(async (req, res) => {
    const { name, plan } = req.body;
    await apiRequest(req.session.auth, 'PATCH', `/orgs/${req.params.id}`, { name, plan });
    res.redirect(`/orgs/${req.params.id}`);
  }),
);

router.post(
  '/:id/memberships',
  verifyCsrf,
  asyncRoute(async (req, res) => {
    const { email, orgRole } = req.body;
    try {
      await apiRequest(req.session.auth, 'POST', `/orgs/${req.params.id}/memberships`, {
        email,
        orgRole,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        const [{ data: org }, { data: members }] = await Promise.all([
          apiRequest(req.session.auth, 'GET', `/orgs/${req.params.id}`),
          apiRequest(req.session.auth, 'GET', `/orgs/${req.params.id}/memberships`),
        ]);
        return res.status(err.status).render('orgs/detail', {
          org,
          members,
          error: err.problem?.detail ?? err.message,
        });
      }
      throw err;
    }
    res.redirect(`/orgs/${req.params.id}`);
  }),
);

// Plain HTML forms have no PATCH/DELETE verb — POST-with-action-suffix, same convention
// tickets.js's claim/start/resolve actions already use.
router.post(
  '/:id/memberships/:membershipId/role',
  verifyCsrf,
  asyncRoute(async (req, res) => {
    await apiRequest(
      req.session.auth,
      'PATCH',
      `/orgs/${req.params.id}/memberships/${req.params.membershipId}`,
      { orgRole: req.body.orgRole },
    );
    res.redirect(`/orgs/${req.params.id}`);
  }),
);

router.post(
  '/:id/memberships/:membershipId/remove',
  verifyCsrf,
  asyncRoute(async (req, res) => {
    await apiRequest(
      req.session.auth,
      'DELETE',
      `/orgs/${req.params.id}/memberships/${req.params.membershipId}`,
    );
    res.redirect(`/orgs/${req.params.id}`);
  }),
);

export default router;
