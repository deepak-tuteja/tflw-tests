import { Router } from 'express';
import { apiRequest } from '../apiClient.js';
import { asyncRoute } from '../asyncRoute.js';
import { verifyCsrf } from '../middleware/csrf.js';

const PAGE_SIZE = 15;
const router = Router();

function qs(params) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
  return new URLSearchParams(clean).toString();
}

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const { categoryId, q } = req.query;
    const query = qs({ page, pageSize: PAGE_SIZE, categoryId, q });

    const [{ data: result }, { data: categories }] = await Promise.all([
      apiRequest(req.session.auth, 'GET', `/products?${query}`),
      apiRequest(req.session.auth, 'GET', '/categories'),
    ]);

    res.render('products/list', {
      products: result.data,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      categories,
      categoryId: categoryId ?? '',
      q: q ?? '',
    });
  }),
);

router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const [{ data: product }, { data: reviewPage }] = await Promise.all([
      apiRequest(req.session.auth, 'GET', `/products/${req.params.id}`),
      apiRequest(req.session.auth, 'GET', `/products/${req.params.id}/reviews?limit=50`),
    ]);
    res.render('products/detail', { product, reviews: reviewPage.data });
  }),
);

router.post(
  '/:id/reviews/:reviewId/reply',
  verifyCsrf,
  asyncRoute(async (req, res) => {
    await apiRequest(req.session.auth, 'POST', `/reviews/${req.params.reviewId}/reply`, {
      replyText: req.body.replyText,
    });
    res.redirect(`/products/${req.params.id}`);
  }),
);

export default router;
