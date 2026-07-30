import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import { ApiError } from './apiClient.js';
import { attachCsrfToken } from './middleware/csrf.js';
import { requireAuth } from './middleware/requireAuth.js';
import authRouter from './routes/auth.js';
import dashboardRouter from './routes/dashboard.js';
import categoriesRouter from './routes/categories.js';
import productsRouter from './routes/products.js';
import ticketsRouter from './routes/tickets.js';
import couponsRouter from './routes/coupons.js';
import ordersRouter from './routes/orders.js';
import orgsRouter from './routes/orgs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    name: 'admin.sid',
    secret: process.env.SESSION_SECRET ?? 'dev-admin-session-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax' },
  }),
);
app.use(attachCsrfToken);
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user ?? null;
  next();
});

app.use('/', authRouter);
app.use('/', requireAuth, dashboardRouter);
app.use('/categories', requireAuth, categoriesRouter);
app.use('/products', requireAuth, productsRouter);
app.use('/tickets', requireAuth, ticketsRouter);
app.use('/coupons', requireAuth, couponsRouter);
app.use('/orders', requireAuth, ordersRouter);
app.use('/orgs', requireAuth, orgsRouter);

// Every route below requireAuth reaches apiV2 through apiClient.js's apiRequest — a rejected
// call throws ApiError instead of being handled inline, so one place renders the "apiV2 said no"
// page instead of every route repeating its own try/catch.
app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.status >= 400 && err.status < 600 ? err.status : 502).render('error', {
      title: `apiV2 error (${err.status})`,
      message: err.problem?.detail ?? err.message,
    });
  }
  console.error(err);
  res.status(500).render('error', { title: 'Unexpected error', message: err.message });
});

const port = process.env.PORT ?? 3000;
app.listen(port, () => {
  console.log(`webV2 admin console listening on :${port}`);
});
