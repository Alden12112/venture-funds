import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT || 10000);
const authSecret = process.env.AUTH_SECRET || 'ad88-local-change-me';
const adminEmail = (process.env.AD88_ADMIN_EMAIL || '').trim().toLowerCase();
const adminPassword = process.env.AD88_ADMIN_PASSWORD || '';
const memoryAccounts = new Map();
const memoryState = new Map();
let pool = null;
const countryPhoneRules = {
  Malaysia: { dialCode: '60', digits: [9, 9] },
  Singapore: { dialCode: '65', digits: [8, 8] },
  China: { dialCode: '86', digits: [11, 11] },
  Indonesia: { dialCode: '62', digits: [9, 12] },
  Thailand: { dialCode: '66', digits: [9, 9] },
  'United States': { dialCode: '1', digits: [10, 10] },
  Canada: { dialCode: '1', digits: [10, 10] },
  'United Kingdom': { dialCode: '44', digits: [9, 10] },
  Australia: { dialCode: '61', digits: [9, 9] },
  India: { dialCode: '91', digits: [10, 10] },
  Japan: { dialCode: '81', digits: [9, 10] },
  'South Korea': { dialCode: '82', digits: [9, 10] },
};

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function setCommonHeaders(res) {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'same-origin');
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeAccount(row) {
  return {
    id: row.id,
    name: row.name ?? row.full_name,
    email: row.email,
    phone: row.phone,
    country: row.country,
    role: row.role || 'user',
    status: row.status || 'active',
    joinedAt: row.joinedAt ?? row.joined_at,
    tier: row.tier || 'Core',
    tradingScore: Number(row.tradingScore ?? row.trading_score ?? 60),
  };
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [salt, expectedHex] = String(stored || '').split(':');
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function encodePart(value) {
  return Buffer.from(value).toString('base64url');
}

function decodePart(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function createToken(payload) {
  const body = encodePart(JSON.stringify({ ...payload, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 }));
  const signature = createHmac('sha256', authSecret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifyToken(token) {
  try {
    const [body, signature] = String(token || '').split('.');
    const expected = createHmac('sha256', authSecret).update(body).digest('base64url');
    if (!body || signature !== expected) return null;
    const payload = JSON.parse(decodePart(body));
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function getToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function requireSession(req, res, role) {
  const session = verifyToken(getToken(req));
  if (!session || (role && session.role !== role)) {
    sendJson(res, 401, { error: 'unauthorized' });
    return null;
  }
  return session;
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('request too large');
  }
  return body ? JSON.parse(body) : {};
}

function validateCredentials(input) {
  const email = String(input.email || '').trim().toLowerCase();
  const phone = String(input.phone || '').trim();
  const name = String(input.name || '').trim();
  const password = String(input.password || '');
  const country = String(input.country || 'Other');
  const rule = countryPhoneRules[country];
  const phoneDigits = normalizePhone(phone);
  const nationalDigits = rule && phoneDigits.startsWith(rule.dialCode) ? phoneDigits.slice(rule.dialCode.length) : phoneDigits;
  const validCountryPhone = rule ? phoneDigits.startsWith(rule.dialCode) && nationalDigits.length >= rule.digits[0] && nationalDigits.length <= rule.digits[1] : true;
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email) || !/^\+?[1-9][\d\s().-]{7,20}$/.test(phone) || !validCountryPhone || password.length < 8) {
    return { error: 'invalid registration fields' };
  }
  return { name, email, phone, country, password };
}

async function initDatabase() {
  if (!process.env.DATABASE_URL) return;
  const { Pool } = await import('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ad88_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL UNIQUE,
      country TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      tier TEXT NOT NULL DEFAULT 'Core',
      trading_score INTEGER NOT NULL DEFAULT 60,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ad88_user_state (
      user_id TEXT NOT NULL,
      state_key TEXT NOT NULL,
      state_value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, state_key)
    );
  `);
}

const databaseReady = initDatabase().catch((error) => {
  console.error('Database unavailable; using in-memory development store.', error instanceof Error ? error.message : error);
  pool = null;
});

async function findAccount(identifier) {
  const normalizedEmail = String(identifier || '').trim().toLowerCase();
  const normalized = normalizePhone(identifier);
  if (pool) {
    const result = await pool.query(`SELECT * FROM ad88_accounts WHERE LOWER(email) = $1 OR regexp_replace(phone, '[^0-9]', '', 'g') = $2 LIMIT 1`, [normalizedEmail, normalized]);
    return result.rows[0] || null;
  }
  return [...memoryAccounts.values()].find((account) => account.email === normalizedEmail || normalizePhone(account.phone) === normalized) || null;
}

async function findAccountById(id) {
  if (pool) {
    const result = await pool.query('SELECT * FROM ad88_accounts WHERE id = $1 LIMIT 1', [id]);
    return result.rows[0] || null;
  }
  return memoryAccounts.get(id) || null;
}

async function accountExists(email, phone) {
  if (pool) {
    const result = await pool.query(`SELECT 1 FROM ad88_accounts WHERE LOWER(email) = $1 OR regexp_replace(phone, '[^0-9]', '', 'g') = $2 LIMIT 1`, [email.toLowerCase(), normalizePhone(phone)]);
    return result.rowCount > 0;
  }
  return [...memoryAccounts.values()].some((account) => account.email === email.toLowerCase() || normalizePhone(account.phone) === normalizePhone(phone));
}

async function saveAccount(account, password) {
  const passwordHash = hashPassword(password);
  if (pool) {
    await pool.query(`INSERT INTO ad88_accounts (id, name, email, phone, country, password_hash, role, status, tier, trading_score) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [account.id, account.name, account.email, account.phone, account.country, passwordHash, account.role, account.status, account.tier, account.tradingScore]);
  } else {
    memoryAccounts.set(account.id, { ...account, password_hash: passwordHash });
  }
  return account;
}

async function listAccounts() {
  if (pool) {
    const result = await pool.query('SELECT * FROM ad88_accounts ORDER BY joined_at DESC');
    return result.rows.map(normalizeAccount);
  }
  return [...memoryAccounts.values()].map(normalizeAccount).sort((a, b) => String(b.joinedAt).localeCompare(String(a.joinedAt)));
}

async function deleteAccount(id) {
  if (pool) {
    await pool.query('DELETE FROM ad88_accounts WHERE id = $1 AND role <> $2', [id, 'admin']);
    await pool.query('DELETE FROM ad88_user_state WHERE user_id = $1', [id]);
  } else {
    const account = memoryAccounts.get(id);
    if (account?.role !== 'admin') memoryAccounts.delete(id);
    memoryState.delete(id);
  }
}

function sessionResponse(account) {
  const normalized = normalizeAccount(account);
  return { session: normalized, token: createToken({ sub: normalized.id, email: normalized.email, name: normalized.name, role: normalized.role }) };
}

async function handleAuth(req, res, requestUrl) {
  if (req.method === 'POST' && requestUrl.pathname === '/api/auth/register') {
    const input = validateCredentials(await readBody(req));
    if (input.error) return sendJson(res, 400, input);
    if (await accountExists(input.email, input.phone)) return sendJson(res, 409, { error: 'email or phone already exists' });
    const account = await saveAccount({ id: randomUUID(), name: input.name, email: input.email, phone: input.phone, country: input.country, role: 'user', status: 'active', tier: 'Core', tradingScore: 60, joinedAt: new Date().toISOString() }, input.password);
    return sendJson(res, 201, sessionResponse(account));
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/auth/login') {
    const input = await readBody(req);
    const identifier = String(input.identifier || '').trim();
    const password = String(input.password || '');
    if (adminEmail && identifier.toLowerCase() === adminEmail && adminPassword && password === adminPassword) {
      const account = { id: 'env-admin', name: 'AD88 Administrator', email: adminEmail, phone: '', country: 'Global', role: 'admin', status: 'active', tier: 'Enterprise', tradingScore: 100, joinedAt: new Date().toISOString() };
      return sendJson(res, 200, sessionResponse(account));
    }
    const account = await findAccount(identifier);
    if (!account || !verifyPassword(password, account.password_hash)) return sendJson(res, 401, { error: 'email, phone or password is incorrect' });
    if (account.status !== 'active' && account.status !== 'approved') return sendJson(res, 403, { error: 'account is not active' });
    return sendJson(res, 200, sessionResponse(account));
  }

  return false;
}

async function handleAdmin(req, res, requestUrl) {
  if (!requireSession(req, res, 'admin')) return true;
  if (req.method === 'GET' && requestUrl.pathname === '/api/admin/users') return sendJson(res, 200, await listAccounts());

  if (req.method === 'POST' && requestUrl.pathname === '/api/admin/users') {
    const input = validateCredentials(await readBody(req));
    if (input.error) return sendJson(res, 400, input);
    if (await accountExists(input.email, input.phone)) return sendJson(res, 409, { error: 'email or phone already exists' });
    const account = await saveAccount({ id: randomUUID(), name: input.name, email: input.email, phone: input.phone, country: input.country, role: 'user', status: 'active', tier: 'Core', tradingScore: 60, joinedAt: new Date().toISOString() }, input.password);
    return sendJson(res, 201, normalizeAccount(account));
  }

  const match = requestUrl.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (req.method === 'DELETE' && match) {
    const account = await findAccountById(match[1]);
    if (!account || account.role === 'admin') return sendJson(res, 404, { error: 'account not found' });
    await deleteAccount(match[1]);
    return sendJson(res, 200, { ok: true });
  }
  return sendJson(res, 404, { error: 'admin route not found' });
}

async function handleSync(req, res, requestUrl) {
  const session = requireSession(req, res);
  if (!session) return true;
  if (req.method === 'GET' && requestUrl.pathname === '/api/sync') {
    if (pool) {
      const result = await pool.query('SELECT state_key, state_value FROM ad88_user_state WHERE user_id = $1', [session.sub]);
      return sendJson(res, 200, Object.fromEntries(result.rows.map((row) => [row.state_key, row.state_value])));
    }
    return sendJson(res, 200, memoryState.get(session.sub) || {});
  }
  if (req.method === 'PUT' && requestUrl.pathname === '/api/sync') {
    const input = await readBody(req);
    const key = String(input.key || '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80);
    if (!key || key === 'session' || key === 'auth-token') return sendJson(res, 400, { error: 'invalid sync key' });
    if (pool) {
      await pool.query(`INSERT INTO ad88_user_state (user_id, state_key, state_value) VALUES ($1,$2,$3::jsonb) ON CONFLICT (user_id, state_key) DO UPDATE SET state_value = EXCLUDED.state_value, updated_at = NOW()`, [session.sub, key, JSON.stringify(input.value)]);
    } else {
      const current = memoryState.get(session.sub) || {};
      current[key] = input.value;
      memoryState.set(session.sub, current);
    }
    return sendJson(res, 200, { ok: true });
  }
  return sendJson(res, 404, { error: 'sync route not found' });
}

async function proxyMarket(res, requestUrl) {
  const symbol = requestUrl.searchParams.get('symbol') || 'GC=F';
  if (!/^[A-Z0-9=^.-]+$/.test(symbol)) return sendJson(res, 400, { error: 'invalid market symbol' });
  const upstream = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  upstream.searchParams.set('range', requestUrl.searchParams.get('range') || '1d');
  upstream.searchParams.set('interval', requestUrl.searchParams.get('interval') || '15m');
  const response = await fetch(upstream, { headers: { 'User-Agent': 'AD88/1.0' } });
  res.statusCode = response.status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(await response.text());
}

async function proxyNews(res, requestUrl) {
  const upstream = new URL('https://query1.finance.yahoo.com/v1/finance/search');
  upstream.searchParams.set('q', requestUrl.searchParams.get('query') || 'bitcoin crypto markets macro');
  upstream.searchParams.set('newsCount', '12');
  upstream.searchParams.set('quotesCount', '0');
  const response = await fetch(upstream, { headers: { 'User-Agent': 'AD88/1.0' } });
  res.statusCode = response.status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(await response.text());
}

async function serveFile(res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const candidate = path.resolve(dist, `.${requested}`);
  if (!candidate.startsWith(path.resolve(dist))) return sendJson(res, 403, { error: 'forbidden' });
  try {
    const body = await fs.readFile(candidate);
    res.statusCode = 200;
    res.setHeader('content-type', contentTypes[path.extname(candidate)] || 'application/octet-stream');
    res.end(body);
  } catch {
    const body = await fs.readFile(path.join(dist, 'index.html'));
    res.statusCode = 200;
    res.setHeader('content-type', contentTypes['.html']);
    res.end(body);
  }
}

const server = http.createServer(async (req, res) => {
  setCommonHeaders(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  try {
    await databaseReady;
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    if (requestUrl.pathname.startsWith('/api/auth/')) {
      const handled = await handleAuth(req, res, requestUrl);
      if (handled !== false) return;
    }
    if (requestUrl.pathname.startsWith('/api/admin/')) return handleAdmin(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/sync')) return handleSync(req, res, requestUrl);
    if (requestUrl.pathname === '/api/market') return proxyMarket(res, requestUrl);
    if (requestUrl.pathname === '/api/news') return proxyNews(res, requestUrl);
    await serveFile(res, requestUrl.pathname);
  } catch (error) {
    sendJson(res, 502, { error: error instanceof Error ? error.message : 'request failed' });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`AD88 server listening on ${port}`);
  if (!process.env.DATABASE_URL) console.warn('DATABASE_URL is not set; account data is not persistent across restarts.');
  if (!adminEmail || !adminPassword) console.warn('AD88_ADMIN_EMAIL / AD88_ADMIN_PASSWORD are not set; admin login is disabled.');
});
