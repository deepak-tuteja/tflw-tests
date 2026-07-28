import { Router } from 'express';
import { apiRequestRaw } from '../apiClient.js';
import { asyncRoute } from '../asyncRoute.js';

const router = Router();

// M43 (PLAN_WEBV2_M40.md decision 5): GET /orders/export (F1) was already real and admin-only,
// just unconsumed by any UI — the browser never talks to apiV2 directly (BFF pattern, same as
// every other admin route), so this streams the CSV through with Content-Disposition intact.
router.get(
  '/export',
  asyncRoute(async (req, res) => {
    const { body, contentType, contentDisposition } = await apiRequestRaw(
      req.session.auth,
      'GET',
      '/orders/export',
    );
    res.set('Content-Type', contentType);
    if (contentDisposition) res.set('Content-Disposition', contentDisposition);
    res.send(body);
  }),
);

export default router;
