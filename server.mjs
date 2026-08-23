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
const appSurface = process.env.APP_SURFACE === 'admin' ? 'admin' : 'frontend';
const remoteApiOrigin = (process.env.REMOTE_API_ORIGIN || '').trim().replace(/\/$/, '');
const memoryAccounts = new Map();
const memoryState = new Map();
const memorySupportMessages = [];
const memoryTradeEvents = [];
const marketProxyCache = new Map();
const marketProxyTtlMs = 8_000;
const newsProxyCache = new Map();
const newsProxyTtlMs = 5 * 60_000;
const marketFallbackPrices = {
  'GC=F': [4680.6, 0.42], 'SI=F': [54.18, -0.18], 'CL=F': [79.22, 1.1], 'NG=F': [2.86, -1.42], 'HG=F': [4.31, 0.68],
  SCCO: [94.3, 0.36], 'BZ=F': [82.14, 0.62], 'PL=F': [982.4, 0.21], 'PA=F': [1028.5, -0.38], 'ZC=F': [432.25, 0.15],
  'ZW=F': [548.5, -0.27], 'KC=F': [312.8, 0.74], 'EURUSD=X': [1.0912, -0.12], 'GBPUSD=X': [1.2748, 0.21],
  'JPY=X': [156.42, 0.09], 'AUDUSD=X': [0.6543, -0.08], 'CAD=X': [1.3714, 0.04], '^GSPC': [5615.2, 0.34], '^NDX': [19842.1, 0.48], '^GDAXI': [18422.6, 0.26],
};
let pool = null;
// Keep the server-side rule set aligned with the international catalogue used by the UI.
// These are national-number lengths after the country calling code.
const countryPhoneRules = {
  Malaysia:[60,9],Singapore:[65,8],China:[86,11],Indonesia:[62,9,12],Thailand:[66,9],Brunei:[673,7],Philippines:[63,10],Vietnam:[84,9],Cambodia:[855,8,9],Laos:[856,8,10],Myanmar:[95,8,10],Taiwan:[886,9],"Hong Kong":[852,8],Macao:[853,8],Japan:[81,9,10],"South Korea":[82,9,10],India:[91,10],Pakistan:[92,10],Bangladesh:[880,10],"Sri Lanka":[94,9],Nepal:[977,10],Australia:[61,9],"New Zealand":[64,9],Fiji:[679,7],"Papua New Guinea":[675,8],"United States":[1,10],Canada:[1,10],Mexico:[52,10],Brazil:[55,11],Argentina:[54,10],Chile:[56,9],Colombia:[57,10],Peru:[51,9],Uruguay:[598,8],Paraguay:[595,9],Bolivia:[591,8],Ecuador:[593,9],Venezuela:[58,10],"Costa Rica":[506,8],Panama:[507,8],Guatemala:[502,8],"Dominican Republic":[1,10],Jamaica:[1,10],"United Kingdom":[44,9,10],Ireland:[353,9],France:[33,9],Germany:[49,10,11],Spain:[34,9],Portugal:[351,9],Italy:[39,9,10],Netherlands:[31,9],Belgium:[32,9],Luxembourg:[352,9],Switzerland:[41,9],Austria:[43,10,11],Denmark:[45,8],Sweden:[46,9,10],Norway:[47,8],Finland:[358,9,10],Iceland:[354,7],Poland:[48,9],Czechia:[420,9],Slovakia:[421,9],Hungary:[36,9],Romania:[40,9],Bulgaria:[359,9],Greece:[30,10],Cyprus:[357,8],Malta:[356,8],Croatia:[385,8],Slovenia:[386,8],Serbia:[381,9],"Bosnia and Herzegovina":[387,8],Montenegro:[382,8],"North Macedonia":[389,8],Albania:[355,9],Ukraine:[380,9],Moldova:[373,8],Belarus:[375,9],Lithuania:[370,8],Latvia:[371,8],Estonia:[372,7],Russia:[7,10],Georgia:[995,9],Armenia:[374,8],Azerbaijan:[994,9],"Türkiye":[90,10],Israel:[972,9],"United Arab Emirates":[971,9],"Saudi Arabia":[966,9],Qatar:[974,8],Kuwait:[965,8],Bahrain:[973,8],Oman:[968,8],Jordan:[962,9],Lebanon:[961,7,8],Iraq:[964,10],Iran:[98,10],Afghanistan:[93,9],Egypt:[20,10],Morocco:[212,9],Algeria:[213,9],Tunisia:[216,8],Libya:[218,9],Sudan:[249,9],Ethiopia:[251,9],Kenya:[254,9],Tanzania:[255,9],Uganda:[256,9],Rwanda:[250,9],Ghana:[233,9],Nigeria:[234,10],"South Africa":[27,9],Zimbabwe:[263,9],Zambia:[260,9],Malawi:[265,9],Mozambique:[258,9],Angola:[244,9],Namibia:[264,9],Botswana:[267,8],Mauritius:[230,8],Seychelles:[248,7],Cameroon:[237,9],"Côte d’Ivoire":[225,10],Senegal:[221,9],Mali:[223,8],"Burkina Faso":[226,8],Niger:[227,8],Togo:[228,8],Benin:[229,8],"DR Congo":[243,9],"Republic of the Congo":[242,9],Gabon:[241,8],"Equatorial Guinea":[240,9],Kazakhstan:[7,10],Uzbekistan:[998,9],Kyrgyzstan:[996,9],Tajikistan:[992,9],Turkmenistan:[993,8],Mongolia:[976,8],Maldives:[960,7],Bhutan:[975,8],Bahamas:[1,10],Barbados:[1,10],"Trinidad and Tobago":[1,10],"Antigua and Barbuda":[1,10],"Saint Kitts and Nevis":[1,10],"Saint Lucia":[1,10],Grenada:[1,10],"Saint Vincent and the Grenadines":[1,10],Dominica:[1,10],Belize:[501,7],Nicaragua:[505,8],Honduras:[504,8],"El Salvador":[503,8],Haiti:[509,8],Cuba:[53,8],Samoa:[685,7],Tonga:[676,5],Vanuatu:[678,7],"Solomon Islands":[677,7],Micronesia:[691,7],"Marshall Islands":[692,7],Palau:[680,7],Kiribati:[686,5],Nauru:[674,7],Tuvalu:[688,5],Madagascar:[261,9],Réunion:[262,9],"Cabo Verde":[238,7],"Sierra Leone":[232,8],Liberia:[231,7],Gambia:[220,7],Guinea:[224,9],"Guinea-Bissau":[245,7],Mauritania:[222,8],Chad:[235,8],"Central African Republic":[236,8],"São Tomé and Príncipe":[239,7],Djibouti:[253,8],Somalia:[252,8],Eritrea:[291,7],"South Sudan":[211,9],Mayotte:[262,9],Palestine:[970,9],Syria:[963,9],Yemen:[967,9],"San Marino":[378,8,10],"Vatican City":[39,10],Monaco:[377,8],"Liechtenstein":[423,7],Andorra:[376,6],"Faroe Islands":[298,6],Greenland:[299,6],Gibraltar:[350,8],"Isle of Man":[44,10],Jersey:[44,10],Guernsey:[44,10],Curaçao:[599,7],Aruba:[297,7],"Sint Maarten":[1,10],Bermuda:[1,10],"Cayman Islands":[1,10],"Puerto Rico":[1,10],Guam:[1,10],"U.S. Virgin Islands":[1,10],
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

function buildMarketFallback(symbol) {
  const [price, change] = marketFallbackPrices[symbol] || [100, 0];
  const previousClose = price / (1 + change / 100);
  const now = Math.floor(Date.now() / 1000);
  const timestamps = Array.from({ length: 48 }, (_, index) => now - (47 - index) * 900);
  const closes = timestamps.map((_, index) => price - (price - previousClose) * ((47 - index) / 47));
  return { ad88Fallback: true, chart: { result: [{ meta: { regularMarketPrice: price, regularMarketTime: now, previousClose, chartPreviousClose: previousClose, regularMarketDayHigh: price * 1.01, regularMarketDayLow: price * 0.99, regularMarketVolume: 0 }, timestamp: timestamps, indicators: { quote: [{ open: closes, high: closes.map((value) => value * 1.002), low: closes.map((value) => value * 0.998), close: closes, volume: closes.map(() => 0) }] } }] } };
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

async function forwardToRemoteApi(req, res, requestUrl, body, bridgeAuth = false) {
  if (!remoteApiOrigin) return false;
  const payload = body === undefined && req.method !== 'GET' && req.method !== 'HEAD' ? await readBody(req) : body;
  const target = `${remoteApiOrigin}${requestUrl.pathname}${requestUrl.search}`;
  const headers = { accept: 'application/json' };
  const token = getToken(req);
  if (token) headers.authorization = `Bearer ${token}`;
  if (payload !== undefined) headers['content-type'] = 'application/json';
  if (bridgeAuth) headers['x-ad88-admin-bridge'] = authSecret;
  try {
    const response = await fetch(target, {
      method: req.method,
      headers,
      body: payload === undefined || req.method === 'GET' || req.method === 'HEAD' ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(12_000),
    });
    res.statusCode = response.status;
    res.setHeader('content-type', response.headers.get('content-type') || 'application/json; charset=utf-8');
    res.setHeader('x-ad88-data-path', 'frontend-api-proxy');
    res.end(await response.text());
    return true;
  } catch (error) {
    sendJson(res, 502, { error: error instanceof Error ? error.message : 'remote API unavailable' });
    return true;
  }
}

function validateCredentials(input) {
  const email = String(input.email || '').trim().toLowerCase();
  const phone = String(input.phone || '').trim();
  const name = String(input.name || '').trim();
  const password = String(input.password || '');
  const country = String(input.country || 'Other');
  const rule = countryPhoneRules[country];
  const phoneDigits = normalizePhone(phone);
  const dialCode = rule ? String(rule[0]) : '';
  const lengths = rule ? rule.slice(1) : [];
  const nationalDigits = rule && phoneDigits.startsWith(dialCode) ? phoneDigits.slice(dialCode.length) : phoneDigits;
  const validCountryPhone = rule ? phoneDigits.startsWith(dialCode) && nationalDigits.length >= lengths[0] && nationalDigits.length <= lengths[lengths.length - 1] : false;
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
    CREATE TABLE IF NOT EXISTS ad88_support_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_email TEXT NOT NULL,
      user_phone TEXT NOT NULL DEFAULT '',
      sender_role TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ad88_trade_events (
      id TEXT PRIMARY KEY,
      position_id TEXT,
      user_id TEXT NOT NULL,
      user_name TEXT,
      user_email TEXT,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      action TEXT NOT NULL,
      lots NUMERIC NOT NULL,
      price NUMERIC NOT NULL,
      contract_size NUMERIC,
      leverage NUMERIC,
      margin NUMERIC,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE ad88_support_messages ADD COLUMN IF NOT EXISTS user_phone TEXT NOT NULL DEFAULT '';
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
    await pool.query('DELETE FROM ad88_support_messages WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM ad88_trade_events WHERE user_id = $1', [id]);
  } else {
    const account = memoryAccounts.get(id);
    if (account?.role !== 'admin') {
      memoryAccounts.delete(id);
      memorySupportMessages.splice(0, memorySupportMessages.length, ...memorySupportMessages.filter((item) => item.userId !== id));
      memoryTradeEvents.splice(0, memoryTradeEvents.length, ...memoryTradeEvents.filter((item) => item.userId !== id));
    }
    memoryState.delete(id);
  }
}

function sessionResponse(account) {
  const normalized = normalizeAccount(account);
  return { session: normalized, token: createToken({ sub: normalized.id, email: normalized.email, name: normalized.name, phone: normalized.phone, role: normalized.role }) };
}

async function handleAuth(req, res, requestUrl) {
  if (req.method === 'POST' && requestUrl.pathname === '/api/auth/register') {
    if (appSurface === 'admin') return sendJson(res, 403, { error: '管理员服务不开放前台注册' });
    const input = validateCredentials(await readBody(req));
    if (input.error) return sendJson(res, 400, input);
    if (await accountExists(input.email, input.phone)) return sendJson(res, 409, { error: 'email or phone already exists' });
    const account = await saveAccount({ id: randomUUID(), name: input.name, email: input.email, phone: input.phone, country: input.country, role: 'user', status: 'active', tier: 'Core', tradingScore: 0, joinedAt: new Date().toISOString() }, input.password);
    return sendJson(res, 201, sessionResponse(account));
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/auth/login') {
    const input = await readBody(req);
    const identifier = String(input.identifier || '').trim();
    const password = String(input.password || '');
    if (appSurface === 'admin' && adminEmail && identifier.toLowerCase() === adminEmail && adminPassword && password === adminPassword) {
      const account = { id: 'env-admin', name: 'AD88 Administrator', email: adminEmail, phone: '', country: 'Global', role: 'admin', status: 'active', tier: 'Enterprise', tradingScore: 100, joinedAt: new Date().toISOString() };
      return sendJson(res, 200, sessionResponse(account));
    }
    const account = await findAccount(identifier);
    if (appSurface === 'admin' && (!account || account.role !== 'admin')) return sendJson(res, 403, { error: '后台仅允许管理员账号登录' });
    const adminBridge = req.headers['x-ad88-admin-bridge'] === authSecret;
    if (appSurface === 'frontend' && account?.role === 'admin' && !adminBridge) return sendJson(res, 403, { error: '管理员请使用独立后台地址登录' });
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
    const body = await readBody(req);
    const input = validateCredentials(body);
    if (input.error) return sendJson(res, 400, input);
    if (await accountExists(input.email, input.phone)) return sendJson(res, 409, { error: 'email or phone already exists' });
    const requestedRole = body.role === 'admin' ? 'admin' : 'user';
    const account = await saveAccount({ id: randomUUID(), name: input.name, email: input.email, phone: input.phone, country: input.country, role: requestedRole, status: 'active', tier: requestedRole === 'admin' ? 'Enterprise' : 'Core', tradingScore: requestedRole === 'admin' ? 100 : 0, joinedAt: new Date().toISOString() }, input.password);
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

function normalizeSupportMessage(row) {
  return {
    id: row.id,
    threadId: row.threadId ?? row.thread_id,
    userId: row.userId ?? row.user_id,
    userName: row.userName ?? row.user_name,
    userEmail: row.userEmail ?? row.user_email,
    userPhone: row.userPhone ?? row.user_phone ?? '',
    senderRole: row.senderRole ?? row.sender_role,
    body: row.body,
    createdAt: row.createdAt ?? row.created_at,
  };
}

async function pruneSupportMessages() {
  const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
  if (pool) {
    await pool.query("DELETE FROM ad88_support_messages WHERE created_at < NOW() - INTERVAL '1 year'");
    return;
  }
  const retained = memorySupportMessages.filter((item) => new Date(item.createdAt).getTime() >= cutoff);
  memorySupportMessages.splice(0, memorySupportMessages.length, ...retained);
}

function normalizeTradeEvent(row) {
  return {
    id: row.id,
    positionId: row.positionId ?? row.position_id,
    userId: row.userId ?? row.user_id,
    userName: row.userName ?? row.user_name,
    userEmail: row.userEmail ?? row.user_email,
    symbol: row.symbol,
    side: row.side,
    action: row.action,
    lots: Number(row.lots),
    price: Number(row.price),
    contractSize: row.contractSize == null && row.contract_size == null ? undefined : Number(row.contractSize ?? row.contract_size),
    leverage: row.leverage == null ? undefined : Number(row.leverage),
    margin: row.margin == null ? undefined : Number(row.margin),
    createdAt: row.createdAt ?? row.created_at,
  };
}

function validateTradeEvent(input) {
  const symbol = String(input.symbol || '').trim().toUpperCase();
  const side = String(input.side || '');
  const action = String(input.action || '');
  const lots = Number(input.lots);
  const price = Number(input.price);
  const contractSize = input.contractSize == null ? undefined : Number(input.contractSize);
  const leverage = input.leverage == null ? undefined : Number(input.leverage);
  const margin = input.margin == null ? undefined : Number(input.margin);
  if (!/^[A-Z0-9]{1,16}$/.test(symbol) || !['long', 'short'].includes(side) || !['open', 'close', 'partial-close', 'risk-update'].includes(action)) return { error: 'invalid trade event' };
  if (!Number.isFinite(lots) || lots <= 0 || lots > 100000 || !Number.isFinite(price) || price <= 0) return { error: 'invalid trade values' };
  if (contractSize !== undefined && (!Number.isFinite(contractSize) || contractSize <= 0)) return { error: 'invalid contract size' };
  if (leverage !== undefined && (!Number.isFinite(leverage) || leverage <= 0)) return { error: 'invalid leverage' };
  if (margin !== undefined && (!Number.isFinite(margin) || margin < 0)) return { error: 'invalid margin' };
  return { symbol, side, action, lots, price, contractSize, leverage, margin, positionId: String(input.positionId || '').slice(0, 120) || undefined };
}

async function listTradeEvents(session, admin = false) {
  if (pool) {
    const result = admin
      ? await pool.query('SELECT * FROM ad88_trade_events ORDER BY created_at DESC LIMIT 500')
      : await pool.query('SELECT * FROM ad88_trade_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500', [session.sub]);
    return result.rows.map(normalizeTradeEvent);
  }
  return memoryTradeEvents
    .filter((item) => admin || item.userId === session.sub)
    .slice(-500)
    .reverse()
    .map(normalizeTradeEvent);
}

async function handleTrades(req, res, requestUrl) {
  const session = requireSession(req, res);
  if (!session) return true;
  if (req.method === 'GET' && requestUrl.pathname === '/api/trades') return sendJson(res, 200, await listTradeEvents(session));
  if (req.method === 'POST' && requestUrl.pathname === '/api/trades') {
    const input = validateTradeEvent(await readBody(req));
    if (input.error) return sendJson(res, 400, input);
    const event = {
      id: randomUUID(),
      positionId: input.positionId,
      userId: session.sub,
      userName: session.name,
      userEmail: session.email,
      ...input,
      createdAt: new Date().toISOString(),
    };
    if (pool) {
      await pool.query('INSERT INTO ad88_trade_events (id, position_id, user_id, user_name, user_email, symbol, side, action, lots, price, contract_size, leverage, margin, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)', [event.id, event.positionId ?? null, event.userId, event.userName, event.userEmail, event.symbol, event.side, event.action, event.lots, event.price, event.contractSize ?? null, event.leverage ?? null, event.margin ?? null, event.createdAt]);
    } else {
      memoryTradeEvents.push(event);
    }
    return sendJson(res, 201, normalizeTradeEvent(event));
  }
  return sendJson(res, 404, { error: 'trade route not found' });
}

async function handleAdminTrades(req, res, requestUrl) {
  if (!requireSession(req, res, 'admin')) return true;
  if (req.method === 'GET' && requestUrl.pathname === '/api/admin/trades') return sendJson(res, 200, await listTradeEvents({ sub: '' }, true));
  return sendJson(res, 404, { error: 'admin trade route not found' });
}

async function handleSupport(req, res, requestUrl) {
  const session = requireSession(req, res);
  if (!session) return true;
  await pruneSupportMessages();
  if (req.method === 'GET' && requestUrl.pathname === '/api/support/messages') {
    if (pool) {
      const result = session.role === 'admin'
        ? await pool.query('SELECT * FROM ad88_support_messages ORDER BY created_at ASC')
        : await pool.query('SELECT * FROM ad88_support_messages WHERE user_id = $1 ORDER BY created_at ASC', [session.sub]);
      return sendJson(res, 200, result.rows.map(normalizeSupportMessage));
    }
    const messages = session.role === 'admin' ? memorySupportMessages : memorySupportMessages.filter((item) => item.userId === session.sub);
    return sendJson(res, 200, messages);
  }
  if (req.method === 'POST' && requestUrl.pathname === '/api/support/messages') {
    const input = await readBody(req);
    const body = String(input.body || '').trim().slice(0, 2000);
    if (!body) return sendJson(res, 400, { error: 'message is required' });
    const requestedThreadId = String(input.threadId || '').trim();
    const existing = requestedThreadId ? memorySupportMessages.find((item) => item.threadId === requestedThreadId) : null;
    let threadId = requestedThreadId;
    let userId = session.sub;
    let userName = session.name;
    let userEmail = session.email;
    if (session.role === 'admin') {
      if (!pool && !existing) return sendJson(res, 400, { error: 'thread not found' });
      if (pool && !threadId) return sendJson(res, 400, { error: 'thread is required' });
      if (pool) {
        const owner = await pool.query('SELECT user_id, user_name, user_email, user_phone FROM ad88_support_messages WHERE thread_id = $1 ORDER BY created_at ASC LIMIT 1', [threadId]);
        if (!owner.rowCount) return sendJson(res, 400, { error: 'thread not found' });
        userId = owner.rows[0].user_id;
        userName = owner.rows[0].user_name;
        userEmail = owner.rows[0].user_email;
        session.phone = owner.rows[0].user_phone ?? '';
      } else {
        userId = existing.userId;
        userName = existing.userName;
        userEmail = existing.userEmail;
        session.phone = existing.userPhone ?? '';
      }
    } else if (!threadId) {
      threadId = `support-${randomUUID()}`;
    }
    const message = { id: randomUUID(), threadId, userId, userName, userEmail, userPhone: session.phone ?? '', senderRole: session.role, body, createdAt: new Date().toISOString() };
    if (pool) {
      await pool.query('INSERT INTO ad88_support_messages (id, thread_id, user_id, user_name, user_email, user_phone, sender_role, body, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [message.id, message.threadId, message.userId, message.userName, message.userEmail, message.userPhone, message.senderRole, message.body, message.createdAt]);
    } else {
      memorySupportMessages.push(message);
    }
    return sendJson(res, 201, message);
  }
  return sendJson(res, 404, { error: 'support route not found' });
}

async function proxyMarket(res, requestUrl) {
  const symbol = requestUrl.searchParams.get('symbol') || 'GC=F';
  if (!/^[A-Z0-9=^.-]+$/.test(symbol)) return sendJson(res, 400, { error: 'invalid market symbol' });
  const upstream = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  upstream.searchParams.set('range', requestUrl.searchParams.get('range') || '1d');
  upstream.searchParams.set('interval', requestUrl.searchParams.get('interval') || '15m');
  const cacheKey = upstream.toString();
  const cacheTtlMs = requestUrl.searchParams.get('fast') === '1' ? 950 : marketProxyTtlMs;
  const cached = marketProxyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('x-ad88-cache', 'fresh');
    res.setHeader('x-ad88-provider', 'cached-yahoo');
    res.end(cached.body);
    return;
  }
  let lastStatus = 502;
  let lastBody = '';
  try {
    const candidates = [upstream, new URL(upstream.toString().replace('query1.finance.yahoo.com', 'query2.finance.yahoo.com'))];
    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate, { headers: { 'User-Agent': 'AD88/1.0', accept: 'application/json' }, signal: AbortSignal.timeout(6500) });
        const body = await response.text();
        lastStatus = response.status;
        lastBody = body;
        if (!response.ok) continue;
        marketProxyCache.set(cacheKey, { expiresAt: Date.now() + cacheTtlMs, body });
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('x-ad88-cache', 'fresh');
        res.setHeader('x-ad88-provider', candidate.hostname);
        res.end(body);
        return;
      } catch {
        continue;
      }
    }
    if (lastStatus === 429 || !lastBody) {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('x-ad88-cache', 'fallback');
      res.end(JSON.stringify(buildMarketFallback(symbol)));
      return;
    }
    res.statusCode = lastStatus;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('x-ad88-cache', 'error');
    res.end(lastBody || JSON.stringify({ error: 'market upstream unavailable' }));
  } catch (error) {
    if (cached) {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('x-ad88-cache', 'stale');
      res.end(cached.body);
      return;
    }
    sendJson(res, 504, { error: error instanceof Error ? error.message : 'market upstream unavailable' });
  }
}

async function proxyNews(res, requestUrl) {
  const query = requestUrl.searchParams.get('query') || 'bitcoin crypto markets macro';
  const cacheKey = query.trim().toLowerCase();
  const cached = newsProxyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('x-ad88-news-cache', 'fresh');
    res.setHeader('x-ad88-news-provider', cached.provider);
    res.end(cached.body);
    return;
  }

  const yahooUrls = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'].map((host) => {
    const url = new URL(`https://${host}/v1/finance/search`);
    url.searchParams.set('q', query);
    url.searchParams.set('newsCount', '12');
    url.searchParams.set('quotesCount', '0');
    return url;
  });
  let lastError = '';
  for (const upstream of yahooUrls) {
    try {
      const response = await fetch(upstream, { headers: { 'User-Agent': 'AD88/1.0', accept: 'application/json' }, signal: AbortSignal.timeout(6500) });
      if (!response.ok) {
        lastError = `Yahoo ${response.status}`;
        continue;
      }
      const payload = await response.json();
      if (!Array.isArray(payload.news)) {
        lastError = 'Yahoo response did not include news';
        continue;
      }
      const body = JSON.stringify({ ...payload, ad88Fallback: false, ad88Source: upstream.hostname });
      newsProxyCache.set(cacheKey, { expiresAt: Date.now() + newsProxyTtlMs, body, provider: upstream.hostname });
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('x-ad88-news-cache', 'fresh');
      res.setHeader('x-ad88-news-provider', upstream.hostname);
      res.end(body);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Yahoo request failed';
    }
  }

  try {
    const gdelt = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
    gdelt.searchParams.set('query', query);
    gdelt.searchParams.set('mode', 'artlist');
    gdelt.searchParams.set('format', 'json');
    gdelt.searchParams.set('maxrecords', '12');
    gdelt.searchParams.set('sort', 'HybridRel');
    const response = await fetch(gdelt, { headers: { 'User-Agent': 'AD88/1.0', accept: 'application/json' }, signal: AbortSignal.timeout(6500) });
    if (response.ok) {
      const payload = await response.json();
      const news = (Array.isArray(payload.articles) ? payload.articles : []).map((article, index) => ({
        uuid: `gdelt-${index}-${Buffer.from(String(article.url || article.title || index)).toString('base64url').slice(0, 18)}`,
        title: String(article.title || 'Market update'),
        publisher: String(article.domain || article.sourcecountry || 'GDELT'),
        link: String(article.url || ''),
        providerPublishTime: Number.isFinite(Date.parse(String(article.seendate || ''))) ? Date.parse(String(article.seendate)) / 1000 : Math.floor(Date.now() / 1000),
        type: 'news',
      }));
      if (news.length) {
        const body = JSON.stringify({ news, ad88Fallback: false, ad88Source: 'api.gdeltproject.org' });
        newsProxyCache.set(cacheKey, { expiresAt: Date.now() + newsProxyTtlMs, body, provider: 'api.gdeltproject.org' });
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('x-ad88-news-cache', 'fresh');
        res.setHeader('x-ad88-news-provider', 'api.gdeltproject.org');
        res.end(body);
        return;
      }
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : lastError;
  }

  if (cached) {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('x-ad88-news-cache', 'stale');
    res.setHeader('x-ad88-news-provider', cached.provider);
    res.end(cached.body);
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const fallbackNews = [
    ['Bitcoin holds near recent range as liquidity stays cautious', 'AD88 Market Desk', 'Crypto', 'United States'],
    ['Gold and dollar focus turns to the next inflation signal', 'AD88 Macro Desk', 'Metals / FX', 'United States'],
    ['Crude oil and natural gas prices track inventory expectations', 'AD88 Energy Desk', 'Energy', 'United States'],
    ['Copper demand outlook keeps industrial metals in focus', 'AD88 Metals Desk', 'Metals', 'China'],
    ['Central-bank language keeps major currency pairs moving', 'AD88 FX Desk', 'FX', 'European Union'],
  ].map(([title, publisher, market, country], index) => ({
    uuid: `ad88-fallback-${index + 1}`,
    title,
    publisher: `${publisher} · ${country}`,
    link: '',
    providerPublishTime: now - index * 1800,
    type: 'fallback',
    market,
  }));
  const body = JSON.stringify({ news: fallbackNews, ad88Fallback: true, ad88Source: `AD88 resilient fallback (${lastError || 'upstreams unavailable'})` });
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('x-ad88-news-cache', 'fallback');
  res.setHeader('x-ad88-news-provider', 'AD88 fallback');
  res.end(body);
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
    if (appSurface === 'admin' && remoteApiOrigin && requestUrl.pathname === '/api/auth/login') {
      const input = await readBody(req);
      if (adminEmail && String(input.identifier || '').trim().toLowerCase() === adminEmail && adminPassword && String(input.password || '') === adminPassword) {
        const account = { id: 'env-admin', name: 'AD88 Administrator', email: adminEmail, phone: '', country: 'Global', role: 'admin', status: 'active', tier: 'Enterprise', tradingScore: 100, joinedAt: new Date().toISOString() };
        return sendJson(res, 200, sessionResponse(account));
      }
      return forwardToRemoteApi(req, res, requestUrl, input, true);
    }
    if (appSurface === 'admin' && remoteApiOrigin && (requestUrl.pathname.startsWith('/api/admin/') || requestUrl.pathname.startsWith('/api/support/') || requestUrl.pathname.startsWith('/api/sync') || requestUrl.pathname.startsWith('/api/trades'))) {
      return forwardToRemoteApi(req, res, requestUrl);
    }
    if (requestUrl.pathname.startsWith('/api/auth/')) {
      const handled = await handleAuth(req, res, requestUrl);
      if (handled !== false) return;
    }
    if (requestUrl.pathname.startsWith('/api/admin/trades')) return handleAdminTrades(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/admin/')) return handleAdmin(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/trades')) return handleTrades(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/support/')) return handleSupport(req, res, requestUrl);
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
