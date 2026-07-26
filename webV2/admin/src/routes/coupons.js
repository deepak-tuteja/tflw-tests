import { Router } from 'express';
import { apiRequest, ApiError } from '../apiClient.js';
import { asyncRoute } from '../asyncRoute.js';
import { verifyCsrf } from '../middleware/csrf.js';
import { requireRole } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireRole('admin'));

router.get('/', (req, res) => {
  res.render('coupons/form', { error: null });
});

router.post(
  '/',
  verifyCsrf,
  asyncRoute(async (req, res) => {
    const { code, type, value, expiresAt, minOrderAmount, usageLimit } = req.body;
    let created;
    try {
      ({ data: created } = await apiRequest(req.session.auth, 'POST', '/coupons', {
        code,
        type,
        value: Number(value),
        expiresAt: new Date(expiresAt).toISOString(),
        minOrderAmount: Number(minOrderAmount),
        usageLimit: Number(usageLimit),
      }));
    } catch (err) {
      if (err instanceof ApiError) {
        return res.status(err.status).render('coupons/form', { error: err.problem?.detail ?? err.message });
      }
      throw err;
    }
    res.render('coupons/created', { coupon: created });
  }),
);

export default router;
