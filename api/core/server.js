// Vanilla Node (no framework) core service for testFlow-tests.
// Showcases: CRUD (products), cross-service bearer auth (tokens issued by
// api/auth, verified here via a shared HMAC secret), an eventual-consistency
// endpoint for `wait until api`, a per-key flaky endpoint for `retry`, and an
// array-returning endpoint for `any`/`all` quantifiers.
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = process.env.PORT || 4001;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:4000';
const TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'testflow-tests-shared-secret';

const READY_AFTER_MS = 1200; // an order "processes" for this long before /orders/:id reports ready
const FLAKY_FAILURES_BEFORE_SUCCESS = 2; // a given `key` fails this many times, then succeeds

let products = [
  { id: '1', name: 'Keyboard', description: 'Mechanical keyboard', price: 79.99, category: 'electronics', inStock: true },
  { id: '2', name: 'Notebook', description: 'Ruled paper notebook', price: 4.5, category: 'stationery', inStock: true },
  { id: '3', name: 'Monitor Arm', description: 'Adjustable monitor arm', price: 59.0, category: 'electronics', inStock: false },
];

const orders = new Map(); // id -> { id, productId, qty, total, createdAt }
const flakyAttempts = new Map(); // key -> attempt count

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

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': FRONTEND_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
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

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': FRONTEND_ORIGIN,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
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
    return sendJson(res, 200, { products: list, total: list.length });
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
    return sendJson(res, 201, { ...order, status: 'processing' });
  }

  if (req.method === 'GET' && url.pathname === '/orders') {
    const claims = requireAuth(req, res);
    if (!claims) return;
    const list = [...orders.values()].map((o) => ({
      ...o,
      status: Date.now() - o.createdAt >= READY_AFTER_MS ? 'ready' : 'processing',
    }));
    return sendJson(res, 200, { orders: list, total: list.length });
  }

  const orderMatch = url.pathname.match(/^\/orders\/([^/]+)$/);
  if (orderMatch && req.method === 'GET') {
    const claims = requireAuth(req, res);
    if (!claims) return;
    const order = orders.get(orderMatch[1]);
    if (!order) return sendJson(res, 404, { error: 'order not found' });
    const status = Date.now() - order.createdAt >= READY_AFTER_MS ? 'ready' : 'processing';
    return sendJson(res, 200, { ...order, status });
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

  return sendJson(res, 404, { error: 'route not found' });
});

server.listen(PORT, () => {
  console.log(`testFlow-tests core service on http://localhost:${PORT}`);
});
