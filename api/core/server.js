// Vanilla Node (no framework) core service for testFlow-tests.
// Showcases: CRUD (products), cross-service bearer auth (tokens issued by
// api/auth, verified here via a shared HMAC secret), a multi-stage order
// workflow for `wait until api`, a per-key flaky endpoint for `retry`, an
// array-returning endpoint for `any`/`all` quantifiers, pagination, rate
// limiting (429 + Retry-After), and a batch-create endpoint with per-item
// partial success.
//
// State is namespaced per test file (`X-Test-NS` header, PLAN M1.5) so
// `--workers N` can run files concurrently without them racing on shared
// products/orders/flaky-attempt/rate-limit state. A request with no header
// lands in the `default` namespace — today's exact single-shared-state
// behavior, so the (untouched) frontend keeps working unmodified.
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = process.env.PORT || 4001;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:4000';
const TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'testflow-tests-shared-secret';

const FLAKY_FAILURES_BEFORE_SUCCESS = 2; // a given `key` fails this many times, then succeeds
// Cumulative ms-from-createdAt boundaries for the order state machine (pending -> processing ->
// shipped -> delivered). Small values keep the demo suite fast; `tflw.config`'s `defaults: timeout
// wait 5s` gives real headroom above `shipped` for `wait until api` to poll through all stages.
const STAGE_MS = { pending: 300, processing: 900, shipped: 1500 };
const RATE_LIMIT_MAX = 3; // requests per namespace per window
const RATE_LIMIT_WINDOW_MS = 1000;

const seedProducts = [
  { id: '1', name: 'Keyboard', description: 'Mechanical keyboard', price: 79.99, category: 'electronics', inStock: true },
  { id: '2', name: 'Notebook', description: 'Ruled paper notebook', price: 4.5, category: 'stationery', inStock: true },
  { id: '3', name: 'Monitor Arm', description: 'Adjustable monitor arm', price: 59.0, category: 'electronics', inStock: false },
];

const namespaces = new Map(); // ns -> { products, orders, flakyAttempts, rateLimit }

function nsState(ns) {
  if (!namespaces.has(ns)) {
    namespaces.set(ns, {
      products: seedProducts.map((p) => ({ ...p })),
      orders: new Map(), // id -> { id, productId, qty, total, createdAt }
      flakyAttempts: new Map(), // key -> attempt count
      rateLimit: { count: 0, windowStart: 0 },
    });
  }
  return namespaces.get(ns);
}

function computeStatus(order) {
  const elapsed = Date.now() - order.createdAt;
  if (elapsed < STAGE_MS.pending) return 'pending';
  if (elapsed < STAGE_MS.processing) return 'processing';
  if (elapsed < STAGE_MS.shipped) return 'shipped';
  return 'delivered';
}

function verifyToken(token) {
  const [body, sig] = (token || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    return null;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': FRONTEND_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

function requireAuth(req, res, { adminOnly = false } = {}) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  const claims = token && verifyToken(token);
  if (!claims) {
    sendJson(res, 401, { error: 'access token required or invalid' });
    return null;
  }
  if (adminOnly && claims.role !== 'admin') {
    sendJson(res, 403, { error: 'admin access required' });
    return null;
  }
  return claims;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const ns = req.headers['x-test-ns'] || 'default';
  const { products, orders, flakyAttempts, rateLimit } = nsState(ns);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': FRONTEND_ORIGIN,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Test-NS',
    });
    return res.end();
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { status: 'OK', timestamp: new Date().toISOString() });
  }

  if (req.method === 'GET' && url.pathname === '/products') {
    let list = [...products];
    const category = url.searchParams.get('category');
    const inStock = url.searchParams.get('inStock');
    if (category) list = list.filter((p) => p.category === category);
    if (inStock !== null) list = list.filter((p) => p.inStock === (inStock === 'true'));

    const pageParam = url.searchParams.get('page');
    const pageSizeParam = url.searchParams.get('pageSize');
    if (pageParam !== null || pageSizeParam !== null) {
      const page = Math.max(1, parseInt(pageParam, 10) || 1);
      const pageSize = Math.max(1, parseInt(pageSizeParam, 10) || 10);
      const total = list.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const start = (page - 1) * pageSize;
      return sendJson(res, 200, { products: list.slice(start, start + pageSize), total, page, pageSize, totalPages });
    }
    return sendJson(res, 200, { products: list, total: list.length });
  }

  if (req.method === 'POST' && url.pathname === '/products/batch') {
    if (!requireAuth(req, res, { adminOnly: true })) return;
    const { items } = await readBody(req);
    if (!Array.isArray(items) || items.length === 0) {
      return sendJson(res, 400, { error: 'items must be a non-empty array' });
    }
    const results = items.map((item) => {
      const { name, price, category } = item || {};
      if (!name || price === undefined || !category) {
        return { ok: false, error: 'name, price, and category are required' };
      }
      if (!(Number(price) > 0)) {
        return { ok: false, error: 'price must be greater than 0' };
      }
      const product = {
        id: crypto.randomUUID(),
        name,
        description: item.description || '',
        price: Number(price),
        category,
        inStock: item.inStock !== undefined ? item.inStock : true,
      };
      products.push(product);
      return { ok: true, id: product.id };
    });
    const succeeded = results.filter((r) => r.ok).length;
    return sendJson(res, 207, { results, succeeded, failed: results.length - succeeded });
  }

  const productMatch = url.pathname.match(/^\/products\/([^/]+)$/);
  if (productMatch) {
    const id = productMatch[1];
    if (req.method === 'GET') {
      const product = products.find((p) => p.id === id);
      if (!product) return sendJson(res, 404, { error: 'product not found' });
      return sendJson(res, 200, product);
    }
    if (req.method === 'PUT') {
      if (!requireAuth(req, res, { adminOnly: true })) return;
      const idx = products.findIndex((p) => p.id === id);
      if (idx === -1) return sendJson(res, 404, { error: 'product not found' });
      const patch = await readBody(req);
      products[idx] = { ...products[idx], ...patch, id };
      return sendJson(res, 200, products[idx]);
    }
    if (req.method === 'DELETE') {
      if (!requireAuth(req, res, { adminOnly: true })) return;
      const idx = products.findIndex((p) => p.id === id);
      if (idx === -1) return sendJson(res, 404, { error: 'product not found' });
      products.splice(idx, 1);
      return sendJson(res, 200, { message: 'product deleted' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/products') {
    if (!requireAuth(req, res, { adminOnly: true })) return;
    const { name, description, price, category, inStock } = await readBody(req);
    if (!name || price === undefined || !category) {
      return sendJson(res, 400, { error: 'name, price, and category are required' });
    }
    const product = {
      id: crypto.randomUUID(),
      name,
      description: description || '',
      price: Number(price),
      category,
      inStock: inStock !== undefined ? inStock : true,
    };
    products.push(product);
    return sendJson(res, 201, product);
  }

  if (req.method === 'POST' && url.pathname === '/orders') {
    const claims = requireAuth(req, res);
    if (!claims) return;
    const { productId, qty } = await readBody(req);
    const product = products.find((p) => p.id === productId);
    if (!product) return sendJson(res, 404, { error: 'product not found' });
    if (!Number.isInteger(qty) || qty <= 0) {
      return sendJson(res, 400, { error: 'qty must be a positive integer' });
    }
    const order = {
      id: crypto.randomUUID(),
      productId,
      qty,
      total: Math.round(product.price * qty * 100) / 100,
      createdAt: Date.now(),
    };
    orders.set(order.id, order);
    return sendJson(res, 201, { ...order, status: computeStatus(order) });
  }

  if (req.method === 'GET' && url.pathname === '/orders') {
    const claims = requireAuth(req, res);
    if (!claims) return;
    const list = [...orders.values()].map((o) => ({ ...o, status: computeStatus(o) }));
    return sendJson(res, 200, { orders: list, total: list.length });
  }

  const orderMatch = url.pathname.match(/^\/orders\/([^/]+)$/);
  if (orderMatch && req.method === 'GET') {
    const claims = requireAuth(req, res);
    if (!claims) return;
    const order = orders.get(orderMatch[1]);
    if (!order) return sendJson(res, 404, { error: 'order not found' });
    return sendJson(res, 200, { ...order, status: computeStatus(order) });
  }

  if (req.method === 'POST' && url.pathname === '/flaky-widget') {
    const claims = requireAuth(req, res);
    if (!claims) return;
    const { key, name } = await readBody(req);
    if (!key) return sendJson(res, 400, { error: 'key is required' });
    const attempts = (flakyAttempts.get(key) || 0) + 1;
    flakyAttempts.set(key, attempts);
    if (attempts <= FLAKY_FAILURES_BEFORE_SUCCESS) {
      return sendJson(res, 503, { error: 'temporarily unavailable', attempt: attempts });
    }
    return sendJson(res, 201, { id: crypto.randomUUID(), key, name, attempt: attempts });
  }

  if (req.method === 'POST' && url.pathname === '/rate-limited-widget') {
    const claims = requireAuth(req, res);
    if (!claims) return;
    const now = Date.now();
    if (now - rateLimit.windowStart >= RATE_LIMIT_WINDOW_MS) {
      rateLimit.windowStart = now;
      rateLimit.count = 0;
    }
    rateLimit.count++;
    if (rateLimit.count > RATE_LIMIT_MAX) {
      const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - rateLimit.windowStart);
      return sendJson(res, 429, { error: 'rate limit exceeded', retryAfterMs }, { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) });
    }
    return sendJson(res, 201, { id: crypto.randomUUID(), attempt: rateLimit.count });
  }

  return sendJson(res, 404, { error: 'route not found' });
});

server.listen(PORT, () => {
  console.log(`testFlow-tests core service on http://localhost:${PORT}`);
});
