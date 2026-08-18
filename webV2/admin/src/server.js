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

// --- V17: the hardened counterpart, and the only page in this console that sets either header ---
//
// `M137f`/tflw `D442` gave Tier 1's document rules their first real subject: apiV2 serves no HTML at
// all, so `sec/csp-missing` and `sec/x-frame-options` had never once fired against a document a real
// app served — `apiV2/src/vuln/vuln.controller.ts` has to *fabricate* a `text/html` response for
// `V4`/`V5`. This console serves genuine documents, and it sets no security headers anywhere, which
// makes every page a live positive (`V16`).
//
// A positive with no matched negative measures nothing, though: a rule that fired everywhere would be
// indistinguishable from a rule that fires unconditionally. So exactly one route sets both headers,
// and the spider is expected to reach it and produce no finding there. That is `V4`/`V5`'s pairing
// (`/vuln/document` against `/vuln/document-hardened`), applied to a real app instead of a fixture.
//
// Deliberately **above** `requireAuth` and linked from the login page: the walk that grades this pair
// is unauthenticated, so both halves have to be reachable without a session or the negative is
// unmeasurable. See ../../../VULNS.md `V16`/`V17`.
app.get('/hardened', (req, res) => {
  // All three of the document rules that fire at a `moderate` floor, not just the two the pair is
  // named for. A "hardened" page that still tripped `sec/nosniff-missing` would be a negative that
  // fails, which measures nothing — the first live run of `spider.tflw` did exactly that and is why
  // this line exists.
  res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'");
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.render('error', {
    title: 'Hardened page',
    message: 'A fixture page that sets Content-Security-Policy and X-Frame-Options. Its whole job is to produce no finding, so the rules that fire on every other page here are shown to be firing on evidence rather than unconditionally.',
  });
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
