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
      // `M154b` / `C2` — set only by the bulk-delete redirect below. Rendered rather than dropped:
      // a redirect that carries a count nothing displays is a claim with no reader.
      deleted: req.query.deleted ?? '',
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

// `M159f-c` — the rename `prompt()` in `detail.ejs` guards, and the reason the answer is worth
// carrying this far. The typed text crosses the browser, this form, this server and apiV2's PATCH
// before anything asserts it, so `GET /products/:id` is a statement about the string the dialog
// actually received rather than about the page that claims to have sent one. Redirects back to the
// detail page so the new name is also the heading.
router.post(
  '/:id/rename',
  verifyCsrf,
  asyncRoute(async (req, res) => {
    await apiRequest(req.session.auth, 'PATCH', `/products/${req.params.id}`, { name: req.body.name });
    res.redirect(`/products/${req.params.id}`);
  }),
);

// M43 (PLAN_WEBV2_M40.md decision 5): DELETE /products/:id is admin-only and already real —
// wired up behind a confirm()-guarded form (detail.ejs) since EJS forms have no native DELETE
// verb. Redirects to the list on success so the product's real absence is the assertion, not a
// rendered message.
router.post(
  '/:id/delete',
  verifyCsrf,
  asyncRoute(async (req, res) => {
    await apiRequest(req.session.auth, 'DELETE', `/products/${req.params.id}`);
    res.redirect('/products');
  }),
);

// `M154b` / `C2` — the bulk action `list.ejs`'s double-confirm form guards.
//
// Scoped by the list page's own filter and to `stock === 0`, deliberately, in both directions. A
// "delete every out-of-stock product" button would take the seed catalogue with it the first time a
// test used it, and a plant that damages the fixtures every other test reads is not a plant, it is
// an outage. Bounded by the same `pageSize` the list uses so the button acts on what the operator
// can actually see.
router.post(
  '/delete-out-of-stock',
  verifyCsrf,
  asyncRoute(async (req, res) => {
    const { q, categoryId } = req.body;
    const query = qs({ page: 1, pageSize: PAGE_SIZE, categoryId, q });
    const { data: result } = await apiRequest(req.session.auth, 'GET', `/products?${query}`);
    const doomed = result.data.filter((p) => p.stock === 0);
    for (const p of doomed) {
      await apiRequest(req.session.auth, 'DELETE', `/products/${p.id}`);
    }
    res.redirect(`/products?${qs({ q, categoryId, deleted: doomed.length })}`);
  }),
);

export default router;
