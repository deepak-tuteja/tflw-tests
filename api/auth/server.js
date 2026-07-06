// Vanilla Node (no framework) auth service for testFlow-tests.
// Showcases: bearer-token login (cross-service, used against api/core) AND
// cookie-based session login (self-contained), so tflw's `session` blocks can
// be exercised over both transports.
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = process.env.PORT || 4002;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:4000';
export const TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'testflow-tests-shared-secret';

const users = new Map([
  ['admin@test.com', { id: '1', email: 'admin@test.com', password: 'admin123', name: 'Admin User', role: 'admin' }],
  ['user@test.com', { id: '2', email: 'user@test.com', password: 'user123', name: 'Test User', role: 'user' }],
]);

const sessions = new Map(); // sid -> user

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
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

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header.split(';').filter(Boolean).map((pair) => {
      const [k, ...v] = pair.trim().split('=');
      return [k, v.join('=')];
    })
  );
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': FRONTEND_ORIGIN,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });
    return res.end();
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { status: 'OK', timestamp: new Date().toISOString() });
  }

  if (req.method === 'POST' && url.pathname === '/auth/register') {
    const { email, password, name } = await readBody(req);
    if (!email || !password || !name) {
      return sendJson(res, 400, { error: 'email, password, and name are required' });
    }
    if (users.has(email)) {
      return sendJson(res, 400, { error: 'user already exists' });
    }
    const user = { id: crypto.randomUUID(), email, password, name, role: 'user' };
    users.set(email, user);
    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    return sendJson(res, 201, { token, user: publicUser(user) });
  }

  if (req.method === 'POST' && url.pathname === '/auth/login') {
    const { email, password } = await readBody(req);
    const user = users.get(email);
    if (!user || user.password !== password) {
      return sendJson(res, 401, { error: 'invalid credentials' });
    }
    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    return sendJson(res, 200, { token, user: publicUser(user) });
  }

  if (req.method === 'POST' && url.pathname === '/auth/session-login') {
    const { email, password } = await readBody(req);
    const user = users.get(email);
    if (!user || user.password !== password) {
      return sendJson(res, 401, { error: 'invalid credentials' });
    }
    const sid = crypto.randomUUID();
    sessions.set(sid, user);
    // sessionId is echoed in the body (not just Set-Cookie) so an API client — including a
    // tflw `session` block, which has no header-parsing/regex facility — can `capture
    // body.sessionId` and replay it as `Cookie: tf_sid={sessionId}` (same pattern proven
    // against restful-booker in testFlow/acceptance/). A real browser still gets the cookie
    // natively via Set-Cookie for the frontend's own use.
    return sendJson(res, 200, { message: 'Login successful', user: publicUser(user), sessionId: sid }, {
      'Set-Cookie': `tf_sid=${sid}; HttpOnly; Path=/; SameSite=Lax`,
    });
  }

  if (req.method === 'POST' && url.pathname === '/auth/logout') {
    const { tf_sid } = parseCookies(req);
    if (tf_sid) sessions.delete(tf_sid);
    return sendJson(res, 200, { message: 'Logged out' }, {
      'Set-Cookie': 'tf_sid=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0',
    });
  }

  if (req.method === 'GET' && url.pathname === '/auth/profile') {
    const { tf_sid } = parseCookies(req);
    const user = tf_sid && sessions.get(tf_sid);
    if (!user) {
      return sendJson(res, 401, { error: 'no active session' });
    }
    return sendJson(res, 200, { user: publicUser(user) });
  }

  return sendJson(res, 404, { error: 'route not found' });
});

server.listen(PORT, () => {
  console.log(`testFlow-tests auth service on http://localhost:${PORT}`);
});
