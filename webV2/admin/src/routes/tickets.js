import { Router } from 'express';
import { apiRequest } from '../apiClient.js';
import { asyncRoute } from '../asyncRoute.js';
import { verifyCsrf } from '../middleware/csrf.js';

const router = Router();

function qs(params) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
  return new URLSearchParams(clean).toString();
}

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const { status, slaBreached, assignedTo } = req.query;
    const query = qs({ status, slaBreached, assignedTo });
    const { data: tickets } = await apiRequest(req.session.auth, 'GET', `/tickets?${query}`);
    res.render('tickets/list', { tickets, status: status ?? '', slaBreached: slaBreached ?? '', assignedTo: assignedTo ?? '' });
  }),
);

router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const [{ data: ticket }, { data: comments }, { data: history }] = await Promise.all([
      apiRequest(req.session.auth, 'GET', `/tickets/${req.params.id}`),
      apiRequest(req.session.auth, 'GET', `/tickets/${req.params.id}/comments`),
      apiRequest(req.session.auth, 'GET', `/tickets/${req.params.id}/history`),
    ]);
    res.render('tickets/detail', { ticket, comments, history });
  }),
);

router.post(
  '/:id/assign',
  verifyCsrf,
  asyncRoute(async (req, res) => {
    await apiRequest(req.session.auth, 'PATCH', `/tickets/${req.params.id}/assign`, {
      assigneeId: req.body.assigneeId,
    });
    res.redirect(`/tickets/${req.params.id}`);
  }),
);

for (const action of ['claim', 'start', 'resolve']) {
  router.post(
    `/:id/${action}`,
    verifyCsrf,
    asyncRoute(async (req, res) => {
      await apiRequest(req.session.auth, 'POST', `/tickets/${req.params.id}/${action}`);
      res.redirect(`/tickets/${req.params.id}`);
    }),
  );
}

router.post(
  '/:id/comments',
  verifyCsrf,
  asyncRoute(async (req, res) => {
    await apiRequest(req.session.auth, 'POST', `/tickets/${req.params.id}/comments`, {
      text: req.body.text,
      isInternal: req.body.isInternal === 'on',
    });
    res.redirect(`/tickets/${req.params.id}`);
  }),
);

export default router;
