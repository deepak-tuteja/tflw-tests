import { Router } from 'express';
import { apiRequest } from '../apiClient.js';
import { asyncRoute } from '../asyncRoute.js';

const router = Router();

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const { data: tree } = await apiRequest(req.session.auth, 'GET', '/categories/tree');
    res.render('categories', { tree });
  }),
);

export default router;
