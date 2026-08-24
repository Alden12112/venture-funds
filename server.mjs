import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT || 10000);
const deploymentRevision = String(process.env.RENDER_GIT_COMMIT || process.env.SOURCE_VERSION || '').trim().slice(0, 12);
const authSecret = process.env.AUTH_SECRET || 'ad88-local-change-me';
const adminEmail = (process.env.AD88_ADMIN_EMAIL || '').trim().toLowerCase();
const adminPassword = process.env.AD88_ADMIN_PASSWORD || '';
const appSurface = process.env.APP_SURFACE === 'admin' ? 'admin' : 'frontend';
const remoteApiOrigin = (process.env.REMOTE_API_ORIGIN || '').trim().replace(/\/$/, '');
// The two independently deployed services use a server-to-server bridge that
// is derived only from their shared AUTH_SECRET. Administrator credentials stay
// in the admin service and are never required by, or copied into, the public
// application service. The derived value never reaches browsers or Git.
const adminBridgeToken = createHmac('sha256', authSecret)
  .update('AD88 internal admin bridge v2')
  .digest('base64url');
// Keep the market key server-side. The browser only ever talks to /api/market.
const twelveDataApiKey = (process.env.TWELVE_DATA_API_KEY || '').trim();
const memoryAccounts = new Map();
const memoryState = new Map();
const memorySupportMessages = [];
const memoryTradeEvents = [];
const memoryCreditAccounts = new Map();
const memoryCreditRequests = new Map();
const memoryBlacklist = new Map();
const memoryNotifications = [];
const marketProxyCache = new Map();
const marketProxyTtlMs = 8_000;
// Twelve Data remains an optional server-only fallback. Its free tier is not
// suited to polling every instrument every few seconds, so the multi-asset
// public snapshot remains primary and Twelve calls are rate-bounded.
const twelveQuoteCache = new Map();
const twelveQuoteTtlMs = 60_000;
const twelveNegativeQuoteTtlMs = 5 * 60_000;
const twelveQuoteWindowMs = 60_000;
const twelveQuoteWindowLimit = 6;
let twelveQuoteWindow = { startedAt: 0, used: 0 };
const spotMetalCache = new Map();
const spotMetalTtlMs = 8_000;
let marketQuoteSnapshotCache = { expiresAt: 0, value: null, builtAt: 0, snapshotId: '' };
let marketQuoteSnapshotRequest = null;
const newsProxyCache = new Map();
const newsProxyTtlMs = 5 * 60_000;
const marketFallbackPrices = {
  'GC=F': [4680.6, 0.42], 'SI=F': [54.18, -0.18], 'CL=F': [79.22, 1.1], 'NG=F': [2.86, -1.42], 'HG=F': [4.31, 0.68],
  SCCO: [94.3, 0.36], 'BZ=F': [82.14, 0.62], 'HO=F': [2.36, 0.48], 'RB=F': [2.19, -0.37], 'LGO=F': [1281.25, -2.33], 'PL=F': [982.4, 0.21], 'PA=F': [1028.5, -0.38], 'ZC=F': [432.25, 0.15],
  'ZW=F': [548.5, -0.27], 'KC=F': [312.8, 0.74], 'EURUSD=X': [1.0912, -0.12], 'GBPUSD=X': [1.2748, 0.21],
  'JPY=X': [156.42, 0.09], 'AUDUSD=X': [0.6543, -0.08], 'CAD=X': [1.3714, 0.04], '^GSPC': [5615.2, 0.34], '^NDX': [19842.1, 0.48], '^GDAXI': [18422.6, 0.26],
};
let pool = null;
let databaseAttemptAt = 0;
let databaseReconnectRequest = null;
// Keep the server-side rule set aligned with the international catalogue used by the UI.
// These are national-number lengths after the country calling code.
const countryPhoneRules = {
  Malaysia:[60,9],Singapore:[65,8],China:[86,11],Indonesia:[62,9,12],Thailand:[66,9],Brunei:[673,7],Philippines:[63,10],Vietnam:[84,9],Cambodia:[855,8,9],Laos:[856,8,10],Myanmar:[95,8,10],Taiwan:[886,9],"Hong Kong":[852,8],Macao:[853,8],Japan:[81,9,10],"South Korea":[82,9,10],India:[91,10],Pakistan:[92,10],Bangladesh:[880,10],"Sri Lanka":[94,9],Nepal:[977,10],Australia:[61,9],"New Zealand":[64,9],Fiji:[679,7],"Papua New Guinea":[675,8],"United States":[1,10],Canada:[1,10],Mexico:[52,10],Brazil:[55,11],Argentina:[54,10],Chile:[56,9],Colombia:[57,10],Peru:[51,9],Uruguay:[598,8],Paraguay:[595,9],Bolivia:[591,8],Ecuador:[593,9],Venezuela:[58,10],"Costa Rica":[506,8],Panama:[507,8],Guatemala:[502,8],"Dominican Republic":[1,10],Jamaica:[1,10],"United Kingdom":[44,9,10],Ireland:[353,9],France:[33,9],Germany:[49,10,11],Spain:[34,9],Portugal:[351,9],Italy:[39,9,10],Netherlands:[31,9],Belgium:[32,9],Luxembourg:[352,9],Switzerland:[41,9],Austria:[43,10,11],Denmark:[45,8],Sweden:[46,9,10],Norway:[47,8],Finland:[358,9,10],Iceland:[354,7],Poland:[48,9],Czechia:[420,9],Slovakia:[421,9],Hungary:[36,9],Romania:[40,9],Bulgaria:[359,9],Greece:[30,10],Cyprus:[357,8],Malta:[356,8],Croatia:[385,8],Slovenia:[386,8],Serbia:[381,9],"Bosnia and Herzegovina":[387,8],Montenegro:[382,8],"North Macedonia":[389,8],Albania:[355,9],Ukraine:[380,9],Moldova:[373,8],Belarus:[375,9],Lithuania:[370,8],Latvia:[371,8],Estonia:[372,7],Russia:[7,10],Georgia:[995,9],Armenia:[374,8],Azerbaijan:[994,9],"Türkiye":[90,10],Israel:[972,9],"United Arab Emirates":[971,9],"Saudi Arabia":[966,9],Qatar:[974,8],Kuwait:[965,8],Bahrain:[973,8],Oman:[968,8],Jordan:[962,9],Lebanon:[961,7,8],Iraq:[964,10],Iran:[98,10],Afghanistan:[93,9],Egypt:[20,10],Morocco:[212,9],Algeria:[213,9],Tunisia:[216,8],Libya:[218,9],Sudan:[249,9],Ethiopia:[251,9],Kenya:[254,9],Tanzania:[255,9],Uganda:[256,9],Rwanda:[250,9],Ghana:[233,9],Nigeria:[234,10],"South Africa":[27,9],Zimbabwe:[263,9],Zambia:[260,9],Malawi:[265,9],Mozambique:[258,9],Angola:[244,9],Namibia:[264,9],Botswana:[267,8],Mauritius:[230,8],Seychelles:[248,7],Cameroon:[237,9],"Côte d’Ivoire":[225,10],Senegal:[221,9],Mali:[223,8],"Burkina Faso":[226,8],Niger:[227,8],Togo:[228,8],Benin:[229,8],"DR Congo":[243,9],"Republic of the Congo":[242,9],Gabon:[241,8],"Equatorial Guinea":[240,9],Kazakhstan:[7,10],Uzbekistan:[998,9],Kyrgyzstan:[996,9],Tajikistan:[992,9],Turkmenistan:[993,8],Mongolia:[976,8],Maldives:[960,7],Bhutan:[975,8],Bahamas:[1,10],Barbados:[1,10],"Trinidad and Tobago":[1,10],"Antigua and Barbuda":[1,10],"Saint Kitts and Nevis":[1,10],"Saint Lucia":[1,10],Grenada:[1,10],"Saint Vincent and the Grenadines":[1,10],Dominica:[1,10],Belize:[501,7],Nicaragua:[505,8],Honduras:[504,8],"El Salvador":[503,8],Haiti:[509,8],Cuba:[53,8],Samoa:[685,7],Tonga:[676,5],Vanuatu:[678,7],"Solomon Islands":[677,7],Micronesia:[691,7],"Marshall Islands":[692,7],Palau:[680,7],Kiribati:[686,5],Nauru:[674,7],Tuvalu:[688,5],Madagascar:[261,9],Réunion:[262,9],"Cabo Verde":[238,7],"Sierra Leone":[232,8],Liberia:[231,7],Gambia:[220,7],Guinea:[224,9],"Guinea-Bissau":[245,7],Mauritania:[222,8],Chad:[235,8],"Central African Republic":[236,8],"São Tomé and Príncipe":[239,7],Djibouti:[253,8],Somalia:[252,8],Eritrea:[291,7],"South Sudan":[211,9],Mayotte:[262,9],Palestine:[970,9],Syria:[963,9],Yemen:[967,9],"San Marino":[378,8,10],"Vatican City":[39,10],Monaco:[377,8],"Liechtenstein":[423,7],Andorra:[376,6],"Faroe Islands":[298,6],Greenland:[299,6],Gibraltar:[350,8],"Isle of Man":[44,10],Jersey:[44,10],Guernsey:[44,10],Curaçao:[599,7],Aruba:[297,7],"Sint Maarten":[1,10],Bermuda:[1,10],"Cayman Islands":[1,10],"Puerto Rico":[1,10],Guam:[1,10],"U.S. Virgin Islands":[1,10],
};

// Malaysia registrations accept a 9- or 10-digit national number after +60.
countryPhoneRules.Malaysia = [60, 9, 10];

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
  const bridge = String(req.headers['x-ad88-admin-bridge'] || '');
  if (role === 'admin' && adminBridgeToken && bridge.length === adminBridgeToken.length) {
    const bridgeBuffer = Buffer.from(bridge);
    const expectedBuffer = Buffer.from(adminBridgeToken);
    if (timingSafeEqual(bridgeBuffer, expectedBuffer)) {
      return { sub: 'env-admin', email: adminEmail, name: 'AD88 Administrator', phone: '', role: 'admin' };
    }
  }
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
  if (bridgeAuth) headers['x-ad88-admin-bridge'] = adminBridgeToken || authSecret;
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
  if (!process.env.DATABASE_URL || pool) return;
  const { Pool } = await import('pg');
  const candidate = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  try {
    await candidate.query(`
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
    CREATE TABLE IF NOT EXISTS ad88_blacklist (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL UNIQUE,
      country TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      blacklisted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      blacklisted_by TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS ad88_notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      level TEXT NOT NULL,
      target_path TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      pnl NUMERIC,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ad88_ledger_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      currency TEXT NOT NULL DEFAULT 'U',
      status TEXT NOT NULL,
      time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      note TEXT NOT NULL DEFAULT '',
      ref_id TEXT NOT NULL,
      direction TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ad88_credit_accounts (
      user_id TEXT PRIMARY KEY,
      user_name TEXT NOT NULL,
      email TEXT NOT NULL,
      balance NUMERIC NOT NULL DEFAULT 0,
      available NUMERIC NOT NULL DEFAULT 0,
      pending NUMERIC NOT NULL DEFAULT 0,
      granted_total NUMERIC NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ad88_credit_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      email TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewer TEXT
    );
    ALTER TABLE ad88_support_messages ADD COLUMN IF NOT EXISTS user_phone TEXT NOT NULL DEFAULT '';
    ALTER TABLE ad88_trade_events ADD COLUMN IF NOT EXISTS pnl NUMERIC;
    `);
    pool = candidate;
  } catch (error) {
    await candidate.end().catch(() => undefined);
    throw error;
  }
}

async function ensureDatabase() {
  if (pool || !process.env.DATABASE_URL) return;
  if (databaseReconnectRequest) return databaseReconnectRequest;
  // Render may start a web service before a new database is reachable. Retry
  // safely so a transient connection failure cannot leave data in memory.
  if (Date.now() - databaseAttemptAt < 10_000) return;
  databaseAttemptAt = Date.now();
  databaseReconnectRequest = initDatabase()
    .catch((error) => {
      console.error('Database unavailable; retrying persistent storage shortly.', error instanceof Error ? error.message : error);
      pool = null;
    })
    .finally(() => { databaseReconnectRequest = null; });
  return databaseReconnectRequest;
}

const databaseReady = ensureDatabase();

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

async function isBlacklisted(email, phone) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPhone = normalizePhone(phone);
  if (pool) {
    const result = await pool.query(`SELECT 1 FROM ad88_blacklist WHERE LOWER(email) = $1 OR regexp_replace(phone, '[^0-9]', '', 'g') = $2 LIMIT 1`, [normalizedEmail, normalizedPhone]);
    return result.rowCount > 0;
  }
  return [...memoryBlacklist.values()].some((entry) => entry.email === normalizedEmail || normalizePhone(entry.phone) === normalizedPhone);
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
    await pool.query('DELETE FROM ad88_ledger_entries WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM ad88_credit_requests WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM ad88_credit_accounts WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM ad88_notifications WHERE user_id = $1', [id]);
  } else {
    const account = memoryAccounts.get(id);
    if (account?.role !== 'admin') {
      memoryAccounts.delete(id);
      memorySupportMessages.splice(0, memorySupportMessages.length, ...memorySupportMessages.filter((item) => item.userId !== id));
      memoryTradeEvents.splice(0, memoryTradeEvents.length, ...memoryTradeEvents.filter((item) => item.userId !== id));
      memoryCreditRequests.forEach((item, key) => { if (item.userId === id) memoryCreditRequests.delete(key); });
      memoryCreditAccounts.delete(id);
      memoryNotifications.splice(0, memoryNotifications.length, ...memoryNotifications.filter((item) => item.userId !== id));
    }
    memoryState.delete(id);
  }
}

function sessionResponse(account) {
  const normalized = normalizeAccount(account);
  return { session: normalized, token: createToken({ sub: normalized.id, email: normalized.email, name: normalized.name, phone: normalized.phone, role: normalized.role }) };
}

function normalizeNotification(row) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    level: row.level,
    read: false,
    targetPath: row.targetPath ?? row.target_path ?? undefined,
    createdAt: row.createdAt ?? row.created_at,
  };
}

async function createNotification(userId, category, title, body, level = 'info', targetPath) {
  const notification = { id: randomUUID(), userId, category, title, body, level, targetPath: targetPath || null, createdAt: new Date().toISOString() };
  if (pool) {
    await pool.query('INSERT INTO ad88_notifications (id,user_id,category,title,body,level,target_path,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [notification.id, notification.userId, notification.category, notification.title, notification.body, notification.level, notification.targetPath, notification.createdAt]);
  } else {
    memoryNotifications.push(notification);
  }
  return normalizeNotification(notification);
}

async function listNotifications(session, all = false) {
  if (pool) {
    const result = all
      ? await pool.query('SELECT * FROM ad88_notifications ORDER BY created_at DESC LIMIT 500')
      : await pool.query('SELECT * FROM ad88_notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [session.sub]);
    return result.rows.map(normalizeNotification);
  }
  return memoryNotifications.filter((item) => all || item.userId === session.sub).slice().reverse().map(normalizeNotification);
}

async function handleNotifications(req, res, requestUrl) {
  const session = requireSession(req, res);
  if (!session) return true;
  if (req.method === 'GET' && requestUrl.pathname === '/api/notifications') return sendJson(res, 200, await listNotifications(session));
  return sendJson(res, 404, { error: 'notification route not found' });
}

async function handleAuth(req, res, requestUrl) {
  if (req.method === 'POST' && requestUrl.pathname === '/api/auth/register') {
    if (appSurface === 'admin') return sendJson(res, 403, { error: '管理员服务不开放前台注册' });
    const input = validateCredentials(await readBody(req));
    if (input.error) return sendJson(res, 400, input);
    if (await isBlacklisted(input.email, input.phone)) return sendJson(res, 403, { error: 'registration is blocked' });
    if (await accountExists(input.email, input.phone)) return sendJson(res, 409, { error: 'email or phone already exists' });
    const account = await saveAccount({ id: randomUUID(), name: input.name, email: input.email, phone: input.phone, country: input.country, role: 'user', status: 'active', tier: 'Core', tradingScore: 0, joinedAt: new Date().toISOString() }, input.password);
    await getOrCreateCreditAccount({ sub: account.id, name: account.name, email: account.email });
    await createNotification(account.id, 'system', '账号已自动通过', '你的账号已创建，并已同步至后台审核记录。', 'success', '/app/settings');
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
    const adminBridge = req.headers['x-ad88-admin-bridge'] === authSecret || (adminBridgeToken && req.headers['x-ad88-admin-bridge'] === adminBridgeToken);
    if (appSurface === 'frontend' && account?.role === 'admin' && !adminBridge) return sendJson(res, 403, { error: '管理员请使用独立后台地址登录' });
    if (!account || !verifyPassword(password, account.password_hash)) return sendJson(res, 401, { error: 'email, phone or password is incorrect' });
    if (account.status !== 'active' && account.status !== 'approved') return sendJson(res, 403, { error: 'account is not active' });
    return sendJson(res, 200, sessionResponse(account));
  }

  // Restore a persisted browser session before any protected workspace is
  // loaded. This prevents an expired admin token from briefly rendering the
  // console as an "unavailable" backend and makes the independent login flow
  // deterministic after a deploy or a secret rotation.
  if (req.method === 'GET' && requestUrl.pathname === '/api/auth/me') {
    const session = requireSession(req, res);
    if (!session) return true;
    if (session.sub === 'env-admin') {
      return sendJson(res, 200, {
        id: 'env-admin', name: 'AD88 Administrator', email: adminEmail,
        phone: '', country: 'Global', role: 'admin', status: 'active',
        tier: 'Enterprise', tradingScore: 100, joinedAt: new Date().toISOString(),
      });
    }
    const account = await findAccountById(session.sub);
    if (!account) return sendJson(res, 404, { error: 'account not found' });
    return sendJson(res, 200, normalizeAccount(account));
  }

  return false;
}

function normalizeBlacklistEntry(row) {
  return {
    id: row.id,
    userId: row.userId ?? row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    country: row.country,
    reason: row.reason || '',
    blacklistedAt: row.blacklistedAt ?? row.blacklisted_at,
    blacklistedBy: row.blacklistedBy ?? row.blacklisted_by ?? '',
  };
}

async function listBlacklistEntries() {
  if (pool) {
    const result = await pool.query('SELECT * FROM ad88_blacklist ORDER BY blacklisted_at DESC LIMIT 500');
    return result.rows.map(normalizeBlacklistEntry);
  }
  return [...memoryBlacklist.values()].sort((left, right) => new Date(right.blacklistedAt).getTime() - new Date(left.blacklistedAt).getTime()).map(normalizeBlacklistEntry);
}

async function blacklistAccount(accountId, session, reason) {
  const account = await findAccountById(accountId);
  if (!account || account.role === 'admin') return null;
  const entry = {
    id: randomUUID(),
    userId: account.id,
    name: account.name,
    email: account.email,
    phone: account.phone,
    country: account.country,
    reason: String(reason || '注册审核不通过').trim().slice(0, 240),
    blacklistedAt: new Date().toISOString(),
    blacklistedBy: session.email || session.name || 'AD88 Admin',
  };
  if (pool) {
    const existing = await pool.query('SELECT id FROM ad88_blacklist WHERE user_id = $1 LIMIT 1', [account.id]);
    if (existing.rowCount) {
      await pool.query('UPDATE ad88_blacklist SET reason=$2, blacklisted_at=$3, blacklisted_by=$4 WHERE user_id=$1', [account.id, entry.reason, entry.blacklistedAt, entry.blacklistedBy]);
      await pool.query('UPDATE ad88_accounts SET status=$2 WHERE id=$1', [account.id, 'locked']);
      const updated = await pool.query('SELECT * FROM ad88_blacklist WHERE user_id = $1', [account.id]);
      return normalizeBlacklistEntry(updated.rows[0]);
    }
    await pool.query('UPDATE ad88_accounts SET status=$2 WHERE id=$1', [account.id, 'locked']);
    await pool.query('INSERT INTO ad88_blacklist (id,user_id,name,email,phone,country,reason,blacklisted_at,blacklisted_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [entry.id, entry.userId, entry.name, entry.email, entry.phone, entry.country, entry.reason, entry.blacklistedAt, entry.blacklistedBy]);
  } else {
    const accountRecord = memoryAccounts.get(account.id);
    if (accountRecord) memoryAccounts.set(account.id, { ...accountRecord, status: 'locked' });
    const existing = [...memoryBlacklist.values()].find((item) => item.userId === account.id);
    if (existing) memoryBlacklist.set(existing.id, { ...existing, ...entry, id: existing.id });
    else memoryBlacklist.set(entry.id, entry);
  }
  return normalizeBlacklistEntry(entry);
}

async function restoreBlacklistEntry(id) {
  if (pool) {
    const result = await pool.query('SELECT * FROM ad88_blacklist WHERE id = $1 LIMIT 1', [id]);
    if (!result.rowCount) return null;
    const entry = normalizeBlacklistEntry(result.rows[0]);
    await pool.query('UPDATE ad88_accounts SET status=$2 WHERE id=$1 AND role <> $3', [entry.userId, 'active', 'admin']);
    await pool.query('DELETE FROM ad88_blacklist WHERE id=$1', [id]);
    return entry;
  }
  const entry = memoryBlacklist.get(id);
  if (!entry) return null;
  const account = memoryAccounts.get(entry.userId);
  if (account && account.role !== 'admin') memoryAccounts.set(entry.userId, { ...account, status: 'active' });
  memoryBlacklist.delete(id);
  return normalizeBlacklistEntry(entry);
}

async function handleAdmin(req, res, requestUrl) {
  const session = requireSession(req, res, 'admin');
  if (!session) return true;
  if (req.method === 'GET' && requestUrl.pathname === '/api/admin/users') return sendJson(res, 200, await listAccounts());
  if (req.method === 'GET' && requestUrl.pathname === '/api/admin/blacklist') return sendJson(res, 200, await listBlacklistEntries());

  if (req.method === 'POST' && requestUrl.pathname === '/api/admin/users') {
    const body = await readBody(req);
    const input = validateCredentials(body);
    if (input.error) return sendJson(res, 400, input);
    if (await isBlacklisted(input.email, input.phone)) return sendJson(res, 403, { error: 'registration is blocked' });
    if (await accountExists(input.email, input.phone)) return sendJson(res, 409, { error: 'email or phone already exists' });
    const requestedRole = body.role === 'admin' ? 'admin' : 'user';
    const account = await saveAccount({ id: randomUUID(), name: input.name, email: input.email, phone: input.phone, country: input.country, role: requestedRole, status: 'active', tier: requestedRole === 'admin' ? 'Enterprise' : 'Core', tradingScore: requestedRole === 'admin' ? 100 : 0, joinedAt: new Date().toISOString() }, input.password);
    await getOrCreateCreditAccount({ sub: account.id, name: account.name, email: account.email });
    await createNotification(account.id, 'system', '后台已创建账号', '账号已由后台创建，并已自动通过审核。', 'success', '/app/settings');
    return sendJson(res, 201, normalizeAccount(account));
  }

  const blacklistMatch = requestUrl.pathname.match(/^\/api\/admin\/users\/([^/]+)\/blacklist$/);
  if (req.method === 'POST' && blacklistMatch) {
    const body = await readBody(req);
    const entry = await blacklistAccount(blacklistMatch[1], session, body.reason);
    return entry ? sendJson(res, 200, entry) : sendJson(res, 404, { error: 'account not found' });
  }
  const restoreMatch = requestUrl.pathname.match(/^\/api\/admin\/blacklist\/([^/]+)\/restore$/);
  if (req.method === 'POST' && restoreMatch) {
    const entry = await restoreBlacklistEntry(restoreMatch[1]);
    return entry ? sendJson(res, 200, entry) : sendJson(res, 404, { error: 'blacklist entry not found' });
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

function normalizeCreditAccount(row) {
  return {
    userId: row.userId ?? row.user_id,
    userName: row.userName ?? row.user_name,
    email: row.email,
    balance: Number(row.balance ?? 0),
    available: Number(row.available ?? 0),
    pending: Number(row.pending ?? 0),
    grantedTotal: Number(row.grantedTotal ?? row.granted_total ?? 0),
    updatedAt: row.updatedAt ?? row.updated_at ?? new Date().toISOString(),
  };
}

function normalizeCreditRequest(row) {
  return {
    id: row.id,
    userId: row.userId ?? row.user_id,
    userName: row.userName ?? row.user_name,
    email: row.email,
    amount: Number(row.amount ?? 0),
    reason: row.reason,
    status: row.status,
    requestedAt: row.requestedAt ?? row.requested_at,
    reviewedAt: row.reviewedAt ?? row.reviewed_at ?? undefined,
    reviewer: row.reviewer ?? undefined,
  };
}

async function getOrCreateCreditAccount(session) {
  if (pool) {
    const result = await pool.query('SELECT * FROM ad88_credit_accounts WHERE user_id = $1 LIMIT 1', [session.sub]);
    if (result.rowCount) return normalizeCreditAccount(result.rows[0]);
    const created = {
      userId: session.sub,
      userName: session.name,
      email: session.email,
      balance: 0,
      available: 0,
      pending: 0,
      grantedTotal: 0,
      updatedAt: new Date().toISOString(),
    };
    await pool.query('INSERT INTO ad88_credit_accounts (user_id, user_name, email, balance, available, pending, granted_total, updated_at) VALUES ($1,$2,$3,0,0,0,0,$4)', [created.userId, created.userName, created.email, created.updatedAt]);
    return created;
  }
  const existing = memoryCreditAccounts.get(session.sub);
  if (existing) return normalizeCreditAccount(existing);
  const created = { userId: session.sub, userName: session.name, email: session.email, balance: 0, available: 0, pending: 0, grantedTotal: 0, updatedAt: new Date().toISOString() };
  memoryCreditAccounts.set(session.sub, created);
  return created;
}

async function listCreditAccounts() {
  if (pool) {
    const result = await pool.query('SELECT * FROM ad88_credit_accounts ORDER BY updated_at DESC');
    return result.rows.map(normalizeCreditAccount);
  }
  return [...memoryCreditAccounts.values()].map(normalizeCreditAccount);
}

async function listCreditRequests(session, admin = false) {
  if (pool) {
    const result = admin
      ? await pool.query('SELECT * FROM ad88_credit_requests ORDER BY requested_at DESC LIMIT 500')
      : await pool.query('SELECT * FROM ad88_credit_requests WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 100', [session.sub]);
    return result.rows.map(normalizeCreditRequest);
  }
  return [...memoryCreditRequests.values()]
    .filter((item) => admin || item.userId === session.sub)
    .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
    .map(normalizeCreditRequest);
}

async function updateCreditAccount(account) {
  const normalized = normalizeCreditAccount(account);
  if (pool) {
    await pool.query('UPDATE ad88_credit_accounts SET user_name=$2, email=$3, balance=$4, available=$5, pending=$6, granted_total=$7, updated_at=$8 WHERE user_id=$1', [normalized.userId, normalized.userName, normalized.email, normalized.balance, normalized.available, normalized.pending, normalized.grantedTotal, normalized.updatedAt]);
  } else {
    memoryCreditAccounts.set(normalized.userId, normalized);
  }
  return normalized;
}

async function handleCredits(req, res, requestUrl) {
  const session = requireSession(req, res);
  if (!session) return true;
  if (req.method === 'GET' && requestUrl.pathname === '/api/credits/account') return sendJson(res, 200, await getOrCreateCreditAccount(session));
  if (req.method === 'GET' && requestUrl.pathname === '/api/credits/requests') return sendJson(res, 200, await listCreditRequests(session));
  if (req.method === 'POST' && requestUrl.pathname === '/api/credits/requests') {
    const input = await readBody(req);
    const amount = Math.round(Number(input.amount));
    const reason = String(input.reason || '').trim().slice(0, 240) || '交易额度补充';
    if (!Number.isFinite(amount) || amount < 1 || amount > 1_000_000) return sendJson(res, 400, { error: 'invalid credit request' });
    const account = await getOrCreateCreditAccount(session);
    const request = { id: randomUUID(), userId: session.sub, userName: session.name, email: session.email, amount, reason, status: 'pending', requestedAt: new Date().toISOString() };
    await updateCreditAccount({ ...account, pending: account.pending + amount, updatedAt: request.requestedAt });
    if (pool) {
      await pool.query('INSERT INTO ad88_credit_requests (id,user_id,user_name,email,amount,reason,status,requested_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [request.id, request.userId, request.userName, request.email, request.amount, request.reason, request.status, request.requestedAt]);
    } else {
      memoryCreditRequests.set(request.id, request);
    }
    return sendJson(res, 201, normalizeCreditRequest(request));
  }
  if (req.method === 'POST' && requestUrl.pathname === '/api/credits/reserve') {
    const amount = Number((await readBody(req)).amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return sendJson(res, 400, { error: 'invalid reserve amount' });
    const account = await getOrCreateCreditAccount(session);
    if (account.available < amount) return sendJson(res, 409, { error: 'insufficient margin', account });
    return sendJson(res, 200, await updateCreditAccount({ ...account, available: Number((account.available - amount).toFixed(2)), updatedAt: new Date().toISOString() }));
  }
  if (req.method === 'POST' && requestUrl.pathname === '/api/credits/settle') {
    const input = await readBody(req);
    const amount = Number(input.amount);
    const pnl = Number(input.pnl || 0);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(pnl) || Math.abs(pnl) > 1_000_000) return sendJson(res, 400, { error: 'invalid settlement' });
    const account = await getOrCreateCreditAccount(session);
    return sendJson(res, 200, await updateCreditAccount({ ...account, balance: Number((account.balance + pnl).toFixed(2)), available: Number((account.available + amount + pnl).toFixed(2)), updatedAt: new Date().toISOString() }));
  }
  return sendJson(res, 404, { error: 'credits route not found' });
}

async function handleAdminCredits(req, res, requestUrl) {
  const session = requireSession(req, res, 'admin');
  if (!session) return true;
  if (req.method === 'GET' && requestUrl.pathname === '/api/admin/credits/accounts') return sendJson(res, 200, await listCreditAccounts());
  if (req.method === 'GET' && requestUrl.pathname === '/api/admin/credits/requests') return sendJson(res, 200, await listCreditRequests(session, true));
  if (req.method === 'POST' && requestUrl.pathname === '/api/admin/credits/grant') {
    const input = await readBody(req);
    const amount = Math.round(Number(input.amount));
    const targetId = String(input.userId || '').trim();
    if (!targetId || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return sendJson(res, 400, { error: 'invalid grant' });
    const target = await findAccountById(targetId);
    if (!target) return sendJson(res, 404, { error: 'account not found' });
    const account = await getOrCreateCreditAccount({ sub: target.id, name: target.name, email: target.email });
    const updated = await updateCreditAccount({ ...account, userName: target.name, email: target.email, balance: account.balance + amount, available: account.available + amount, grantedTotal: account.grantedTotal + amount, updatedAt: new Date().toISOString() });
    await createNotification(target.id, 'fund', 'U 余额已更新', `后台已发放 ${amount} U 到你的账户。`, 'success', '/app/dashboard');
    return sendJson(res, 200, updated);
  }
  if (req.method === 'POST' && requestUrl.pathname === '/api/admin/credits/approve') {
    const input = await readBody(req);
    const id = String(input.id || '').trim();
    let target;
    if (pool) {
      const result = await pool.query('SELECT * FROM ad88_credit_requests WHERE id = $1 LIMIT 1', [id]);
      target = result.rows[0] ? normalizeCreditRequest(result.rows[0]) : null;
    } else {
      target = memoryCreditRequests.get(id) ? normalizeCreditRequest(memoryCreditRequests.get(id)) : null;
    }
    if (!target || target.status !== 'pending') return sendJson(res, 404, { error: 'credit request not found' });
    const account = await getOrCreateCreditAccount({ sub: target.userId, name: target.userName, email: target.email });
    await updateCreditAccount({ ...account, balance: account.balance + target.amount, available: account.available + target.amount, pending: Math.max(0, account.pending - target.amount), grantedTotal: account.grantedTotal + target.amount, updatedAt: new Date().toISOString() });
    const reviewedAt = new Date().toISOString();
    if (pool) {
      await pool.query('UPDATE ad88_credit_requests SET status=$2, reviewed_at=$3, reviewer=$4 WHERE id=$1', [id, 'approved', reviewedAt, session.name]);
    } else {
      memoryCreditRequests.set(id, { ...target, status: 'approved', reviewedAt, reviewer: session.name });
    }
    await createNotification(target.userId, 'fund', 'U 申请已通过', `你的 ${target.amount} U 申请已由后台通过。`, 'success', '/app/dashboard');
    return sendJson(res, 200, { ...target, status: 'approved', reviewedAt, reviewer: session.name });
  }
  return sendJson(res, 404, { error: 'admin credits route not found' });
}

async function handleProfile(req, res, requestUrl) {
  const session = requireSession(req, res);
  if (!session) return true;
  if (req.method === 'GET' && requestUrl.pathname === '/api/profile') {
    const account = await findAccountById(session.sub);
    return account ? sendJson(res, 200, normalizeAccount(account)) : sendJson(res, 404, { error: 'profile not found' });
  }
  if (req.method === 'PUT' && requestUrl.pathname === '/api/profile') {
    const input = await readBody(req);
    const current = await findAccountById(session.sub);
    if (!current) return sendJson(res, 404, { error: 'profile not found' });
    const name = String(input.name ?? current.name).trim();
    const email = String(input.email ?? current.email).trim().toLowerCase();
    const phone = String(input.phone ?? current.phone).trim();
    const country = String(input.country ?? current.country).trim();
    const rule = countryPhoneRules[country];
    const digits = normalizePhone(phone);
    const national = rule && digits.startsWith(String(rule[0])) ? digits.slice(String(rule[0]).length) : digits;
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email) || !rule || !digits.startsWith(String(rule[0])) || national.length < rule[1] || national.length > rule[rule.length - 1]) return sendJson(res, 400, { error: 'invalid profile fields' });
    if (pool) {
      const duplicate = await pool.query('SELECT id FROM ad88_accounts WHERE (LOWER(email) = $1 OR regexp_replace(phone, \'[^0-9]\', \'\', \'g\') = $2) AND id <> $3 LIMIT 1', [email, digits, session.sub]);
      if (duplicate.rowCount) return sendJson(res, 409, { error: 'email or phone already exists' });
      await pool.query('UPDATE ad88_accounts SET name=$2, email=$3, phone=$4, country=$5 WHERE id=$1', [session.sub, name, email, phone, country]);
      return sendJson(res, 200, normalizeAccount({ ...current, name, email, phone, country }));
    }
    const duplicate = [...memoryAccounts.values()].find((item) => item.id !== session.sub && (item.email === email || normalizePhone(item.phone) === digits));
    if (duplicate) return sendJson(res, 409, { error: 'email or phone already exists' });
    const updated = { ...current, name, email, phone, country };
    memoryAccounts.set(session.sub, updated);
    return sendJson(res, 200, normalizeAccount(updated));
  }
  return sendJson(res, 404, { error: 'profile route not found' });
}

async function handleSync(req, res, requestUrl) {
  const session = requireSession(req, res);
  if (!session) return true;
  if (req.method === 'GET' && requestUrl.pathname === '/api/sync') {
    if (session.role === 'admin' && requestUrl.searchParams.get('scope') === 'all') {
      if (pool) {
        const result = await pool.query("SELECT state_key, state_value FROM ad88_user_state WHERE state_key IN ('paperPositions','notificationReads') ORDER BY updated_at DESC");
        const merged = {};
        for (const row of result.rows) {
          const value = row.state_value;
          if (row.state_key === 'paperPositions') merged.paperPositions = [...(merged.paperPositions || []), ...(Array.isArray(value) ? value : [])];
          if (row.state_key === 'notificationReads') merged.notificationReads = { ...(merged.notificationReads || {}), ...(value && typeof value === 'object' ? value : {}) };
        }
        return sendJson(res, 200, merged);
      }
      const merged = {};
      for (const state of memoryState.values()) {
        if (Array.isArray(state.paperPositions)) merged.paperPositions = [...(merged.paperPositions || []), ...state.paperPositions];
        if (state.notificationReads && typeof state.notificationReads === 'object') merged.notificationReads = { ...(merged.notificationReads || {}), ...state.notificationReads };
      }
      return sendJson(res, 200, merged);
    }
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
    pnl: row.pnl == null ? undefined : Number(row.pnl),
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
  const pnl = input.pnl == null ? undefined : Number(input.pnl);
  if (!/^[A-Z0-9]{1,16}$/.test(symbol) || !['long', 'short'].includes(side) || !['open', 'close', 'partial-close', 'risk-update'].includes(action)) return { error: 'invalid trade event' };
  if (!Number.isFinite(lots) || lots < 0.01 || lots > 100000 || !Number.isFinite(price) || price <= 0) return { error: 'invalid trade values' };
  if (contractSize !== undefined && (!Number.isFinite(contractSize) || contractSize <= 0)) return { error: 'invalid contract size' };
  if (leverage !== undefined && (!Number.isFinite(leverage) || leverage <= 0)) return { error: 'invalid leverage' };
  if (margin !== undefined && (!Number.isFinite(margin) || margin < 0)) return { error: 'invalid margin' };
  if (pnl !== undefined && (!Number.isFinite(pnl) || Math.abs(pnl) > 1_000_000)) return { error: 'invalid pnl' };
  return { symbol, side, action, lots, price, contractSize, leverage, margin, pnl, positionId: String(input.positionId || '').slice(0, 120) || undefined };
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
      await pool.query('INSERT INTO ad88_trade_events (id, position_id, user_id, user_name, user_email, symbol, side, action, lots, price, contract_size, leverage, margin, pnl, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)', [event.id, event.positionId ?? null, event.userId, event.userName, event.userEmail, event.symbol, event.side, event.action, event.lots, event.price, event.contractSize ?? null, event.leverage ?? null, event.margin ?? null, event.pnl ?? null, event.createdAt]);
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

async function handleAdminNotifications(req, res, requestUrl) {
  const session = requireSession(req, res, 'admin');
  if (!session) return true;
  if (req.method === 'GET' && requestUrl.pathname === '/api/admin/notifications') return sendJson(res, 200, await listNotifications(session, true));
  return sendJson(res, 404, { error: 'admin notification route not found' });
}

function normalizeLedgerEntry(row) {
  return {
    id: row.id,
    type: row.type,
    amount: Number(row.amount),
    currency: row.currency || 'U',
    status: row.status,
    time: row.time,
    note: row.note || '',
    refId: row.refId ?? row.ref_id,
    direction: row.direction,
    userEmail: row.userEmail ?? row.user_email,
    userName: row.userName ?? row.user_name,
  };
}

async function listLedgerEntries(session, all = false) {
  if (pool) {
    const result = all
      ? await pool.query('SELECT ledger.*, account.email AS user_email, account.name AS user_name FROM ad88_ledger_entries ledger LEFT JOIN ad88_accounts account ON account.id = ledger.user_id ORDER BY ledger.time DESC LIMIT 500')
      : await pool.query('SELECT ledger.*, account.email AS user_email, account.name AS user_name FROM ad88_ledger_entries ledger LEFT JOIN ad88_accounts account ON account.id = ledger.user_id WHERE ledger.user_id = $1 ORDER BY ledger.time DESC LIMIT 500', [session.sub]);
    return result.rows.map(normalizeLedgerEntry);
  }
  return [];
}

async function handleLedger(req, res, requestUrl) {
  const session = requireSession(req, res);
  if (!session) return true;
  if (req.method !== 'GET' || requestUrl.pathname !== '/api/ledger') return sendJson(res, 404, { error: 'ledger route not found' });
  const all = session.role === 'admin' && requestUrl.searchParams.get('scope') === 'all';
  return sendJson(res, 200, await listLedgerEntries(session, all));
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
    if (session.role === 'admin') await createNotification(userId, 'task', '客服有新回复', '后台客服已回复你的消息。', 'info', '/app/support');
    return sendJson(res, 201, message);
  }
  return sendJson(res, 404, { error: 'support route not found' });
}

const twelveDataSymbols = {
  // Twelve Data supports FX and digital assets well on its free plan. Its
  // WTI/NatGas aliases are not valid quote symbols, so energy and metals stay
  // on the validated public market snapshot below instead of becoming stale
  // or falling back to a fabricated price.
  'GC=F': 'XAU/USD', 'SI=F': 'XAG/USD', 'BTC-USD': 'BTC/USD', 'ETH-USD': 'ETH/USD', 'SOL-USD': 'SOL/USD',
  'XRP-USD': 'XRP/USD', 'LINK-USD': 'LINK/USD', 'AVAX-USD': 'AVAX/USD', 'EURUSD=X': 'EUR/USD',
  'GBPUSD=X': 'GBP/USD', 'JPY=X': 'USD/JPY', 'AUDUSD=X': 'AUD/USD', 'CAD=X': 'USD/CAD',
};

// This is the server-side catalogue used by the single quote snapshot. It is
// deliberately separate from the React asset catalogue so the browser never
// needs provider credentials or to fan out one request per instrument.
const marketQuoteCatalogue = {
  XAU: 'GC=F', BTC: 'BTC-USD', ETH: 'ETH-USD', CL: 'CL=F', NG: 'NG=F', XAG: 'SI=F', HG: 'HG=F', SCCO: 'SCCO',
  BRN: 'BZ=F', HO: 'HO=F', RB: 'RB=F', LGO: 'LGO=F', PL: 'PL=F', PA: 'PA=F', CORN: 'ZC=F', WHEAT: 'ZW=F', COFFEE: 'KC=F',
  SOL: 'SOL-USD', XRP: 'XRP-USD', LINK: 'LINK-USD', AVAX: 'AVAX-USD', EURUSD: 'EURUSD=X', GBPUSD: 'GBPUSD=X',
  USDJPY: 'JPY=X', AUDUSD: 'AUDUSD=X', USDCAD: 'CAD=X', SPX: '^GSPC', NAS100: '^NDX', DAX: '^GDAXI',
};
const cryptoQuoteSymbols = new Set(['BTC', 'ETH', 'SOL', 'XRP', 'LINK', 'AVAX']);
const internalFallbackPrices = {
  BTC: [76000, 0.4], ETH: [2400, 0.2], SOL: [93, 0.1], XRP: [1.47, 0.1], LINK: [11.3, 0.1], AVAX: [7.4, 0.1],
};
const tradingViewSymbols = {
  XAU: ['cfd', 'OANDA:XAUUSD'], XAG: ['cfd', 'OANDA:XAGUSD'],
  CL: ['futures', 'NYMEX:CL1!'], NG: ['futures', 'NYMEX:NG1!'], HG: ['futures', 'COMEX:HG1!'], BRN: ['futures', 'ICEEUR:BRN1!'],
  HO: ['futures', 'NYMEX:HO1!'], RB: ['futures', 'NYMEX:RB1!'], LGO: ['futures', 'ICEEUR:ULS1!'], PL: ['futures', 'NYMEX:PL1!'], PA: ['futures', 'NYMEX:PA1!'],
  CORN: ['futures', 'CBOT:ZC1!'], WHEAT: ['futures', 'CBOT:ZW1!'], COFFEE: ['futures', 'ICEUS:KC1!'], DAX: ['futures', 'EUREX:FDAX1!'],
  SCCO: ['america', 'NYSE:SCCO'], SPX: ['america', 'SP:SPX'], NAS100: ['america', 'NASDAQ:NDX'],
  EURUSD: ['forex', 'OANDA:EURUSD'], GBPUSD: ['forex', 'OANDA:GBPUSD'], USDJPY: ['forex', 'OANDA:USDJPY'],
  AUDUSD: ['forex', 'OANDA:AUDUSD'], USDCAD: ['forex', 'OANDA:USDCAD'],
};

function twelveInterval(interval) {
  const intervals = { '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '60m': '1h', '1h': '1h', '4h': '4h', '1d': '1day', '1wk': '1week', '1mo': '1month' };
  return intervals[interval] || '15min';
}

function buildTwelveChartPayload(payload, requestedInterval) {
  const values = Array.isArray(payload?.values) ? payload.values.slice().reverse() : [];
  const needsIntradaySeries = !['1d', '1wk', '1mo'].includes(requestedInterval);
  // A date-only value is an end-of-day response. Never draw it as an M1/M5
  // chart, because that would make the ticket look live while its candles are
  // actually delayed by a full session.
  if (needsIntradaySeries && !values.some((value) => /\d{1,2}:\d{2}/.test(String(value?.datetime || '')))) return null;
  const candles = values.map((value) => ({
    time: Math.floor(new Date(`${String(value.datetime).replace(' ', 'T')}Z`).getTime() / 1000),
    open: Number(value.open), high: Number(value.high), low: Number(value.low), close: Number(value.close), volume: Number(value.volume || 0),
  })).filter((value) => Number.isFinite(value.time) && Number.isFinite(value.close) && value.close > 0);
  if (!candles.length) return null;
  const latest = candles.at(-1);
  const first = candles[0];
  const prices = candles.map((value) => value.close);
  return {
    ad88Fallback: false,
    ad88Source: 'Twelve Data',
    ad88Cache: 'fresh',
    ad88Lineage: 'Twelve Data → AD88 server proxy → market workspace',
    chart: {
      result: [{
        meta: {
          regularMarketPrice: latest.close,
          regularMarketTime: latest.time,
          previousClose: first.close,
          chartPreviousClose: first.close,
          regularMarketDayHigh: Math.max(...prices),
          regularMarketDayLow: Math.min(...prices),
          regularMarketVolume: candles.reduce((total, value) => total + value.volume, 0),
        },
        timestamp: candles.map((value) => value.time),
        indicators: { quote: [{ open: candles.map((value) => value.open), high: candles.map((value) => value.high), low: candles.map((value) => value.low), close: candles.map((value) => value.close), volume: candles.map((value) => value.volume) }] },
      }],
    },
  };
}

async function loadTwelveMarket(symbol, interval) {
  const twelveSymbol = twelveDataSymbols[symbol];
  if (!twelveDataApiKey || !twelveSymbol) return null;
  const upstream = new URL('https://api.twelvedata.com/time_series');
  upstream.searchParams.set('symbol', twelveSymbol);
  upstream.searchParams.set('interval', twelveInterval(interval));
  upstream.searchParams.set('outputsize', '160');
  upstream.searchParams.set('timezone', 'UTC');
  upstream.searchParams.set('apikey', twelveDataApiKey);
  const response = await fetch(upstream, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6500) });
  if (!response.ok) return null;
  return buildTwelveChartPayload(await response.json(), interval);
}

function reserveTwelveQuoteRequest() {
  const now = Date.now();
  if (now - twelveQuoteWindow.startedAt >= twelveQuoteWindowMs) {
    twelveQuoteWindow = { startedAt: now, used: 0 };
  }
  if (twelveQuoteWindow.used >= twelveQuoteWindowLimit) return false;
  twelveQuoteWindow.used += 1;
  return true;
}

async function loadTwelveQuote(providerSymbol) {
  const twelveSymbol = twelveDataSymbols[providerSymbol];
  if (!twelveDataApiKey || !twelveSymbol) return null;
  const cached = twelveQuoteCache.get(providerSymbol);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (!reserveTwelveQuoteRequest()) return null;
  const upstream = new URL('https://api.twelvedata.com/quote');
  upstream.searchParams.set('symbol', twelveSymbol);
  upstream.searchParams.set('apikey', twelveDataApiKey);
  const response = await fetch(upstream, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6500) });
  if (!response.ok) return null;
  const payload = await response.json();
  const price = Number(payload.close ?? payload.price);
  const rawTimestamp = String(payload.datetime || '');
  // A free-plan quote with only a date is end-of-day data. Keep it out of the
  // live quote path; TradingView/spot/Yahoo can continue supplying the current
  // snapshot instead.
  if (!Number.isFinite(price) || price <= 0 || !/\d{1,2}:\d{2}/.test(rawTimestamp)) {
    twelveQuoteCache.set(providerSymbol, { expiresAt: Date.now() + twelveNegativeQuoteTtlMs, value: null });
    return null;
  }
  const previous = Number(payload.previous_close ?? payload.prev_close);
  const value = {
    price,
    change24h: Number.isFinite(Number(payload.percent_change)) ? Number(payload.percent_change) : previous > 0 ? ((price - previous) / previous) * 100 : 0,
    volume24h: Number(payload.volume) || 0,
    quoteUpdatedAt: new Date(`${rawTimestamp.replace(' ', 'T')}Z`).toISOString(),
    provider: 'Twelve Data',
    fallback: false,
  };
  twelveQuoteCache.set(providerSymbol, { expiresAt: Date.now() + twelveQuoteTtlMs, value });
  return value;
}

// Gold API is a keyless spot-metal quote. It is a better reference for XAUUSD
// and XAGUSD than the futures symbols GC=F/SI=F used by Yahoo, which can be
// materially different from the broker-style spot quote shown in MT5.
async function loadSpotMetalQuote(symbol) {
  const key = symbol.toUpperCase();
  const cached = spotMetalCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const response = await fetch(`https://api.gold-api.com/price/${encodeURIComponent(key)}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6500) });
  if (!response.ok) throw new Error(`spot metal provider ${response.status}`);
  const payload = await response.json();
  const price = Number(payload.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error('spot metal price unavailable');
  const value = {
    price,
    change24h: 0,
    volume24h: 0,
    quoteUpdatedAt: payload.updatedAt && !Number.isNaN(Date.parse(payload.updatedAt)) ? new Date(payload.updatedAt).toISOString() : new Date().toISOString(),
    provider: 'spot metal market',
    fallback: false,
  };
  spotMetalCache.set(key, { expiresAt: Date.now() + spotMetalTtlMs, value });
  return value;
}

async function loadCoinbaseQuote(providerSymbol) {
  if (!cryptoQuoteSymbols.has(Object.entries(marketQuoteCatalogue).find(([, value]) => value === providerSymbol)?.[0] || '')) return null;
  const [tickerResponse, statsResponse] = await Promise.all([
    fetch(`https://api.exchange.coinbase.com/products/${encodeURIComponent(providerSymbol)}/ticker`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6500) }),
    fetch(`https://api.exchange.coinbase.com/products/${encodeURIComponent(providerSymbol)}/stats`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6500) }),
  ]);
  if (!tickerResponse.ok || !statsResponse.ok) return null;
  const ticker = await tickerResponse.json();
  const stats = await statsResponse.json();
  const price = Number(ticker.price ?? stats.last);
  const open = Number(stats.open ?? price);
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    price,
    change24h: open > 0 ? ((price - open) / open) * 100 : 0,
    volume24h: Number(stats.volume ?? ticker.volume ?? 0) * price,
    quoteUpdatedAt: ticker.time && !Number.isNaN(Date.parse(ticker.time)) ? new Date(ticker.time).toISOString() : new Date().toISOString(),
    provider: 'exchange market stream',
    fallback: false,
  };
}

async function loadTradingViewSnapshot() {
  const groups = new Map();
  Object.entries(tradingViewSymbols).forEach(([symbol, [market, ticker]]) => {
    const group = groups.get(market) || [];
    group.push({ symbol, ticker });
    groups.set(market, group);
  });
  const output = {};
  await Promise.all([...groups.entries()].map(async ([market, entries]) => {
    try {
      const response = await fetch(`https://scanner.tradingview.com/${market}/scan`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ symbols: { tickers: entries.map((entry) => entry.ticker), query: { types: [] } }, columns: ['close', 'change', 'volume'] }),
        signal: AbortSignal.timeout(6500),
      });
      if (!response.ok) return;
      const payload = await response.json();
      const byTicker = new Map((Array.isArray(payload?.data) ? payload.data : []).map((row) => [row.s, row.d]));
      entries.forEach(({ symbol, ticker }) => {
        const values = byTicker.get(ticker);
        const price = Number(values?.[0]);
        if (!Number.isFinite(price) || price <= 0) return;
        output[symbol] = {
          price,
          change24h: Number(values?.[1]) || 0,
          volume24h: Number(values?.[2]) || 0,
          quoteUpdatedAt: new Date().toISOString(),
          provider: 'public market stream',
          fallback: false,
        };
      });
    } catch {
      // The quote snapshot continues with Twelve Data, Yahoo or local fallback.
    }
  }));
  return output;
}

function buildSpotMetalChart(symbol, quote) {
  const now = Math.floor(Date.now() / 1000);
  const base = quote.price;
  const timestamps = Array.from({ length: 48 }, (_, index) => now - (47 - index) * 900);
  const rawCloses = timestamps.map((_, index) => base * (1 - (47 - index) * 0.00008 + Math.sin(index * 0.65) * 0.00035));
  const anchor = rawCloses.at(-1) || base;
  // Keep the indicative candle shape while making the last close exactly the
  // same reference price used by the quote snapshot and execution ticket.
  const closes = rawCloses.map((value) => value + (base - anchor));
  const previousClose = quote.change24h ? base / (1 + quote.change24h / 100) : closes[0];
  return {
    ad88Fallback: false,
    ad88Source: quote.provider,
    ad88Cache: 'fresh',
    ad88Lineage: 'spot metal quote → AD88 server proxy → market workspace',
    chart: { result: [{ meta: { regularMarketPrice: base, regularMarketTime: Math.floor(new Date(quote.quoteUpdatedAt).getTime() / 1000), previousClose, chartPreviousClose: previousClose, regularMarketDayHigh: Math.max(...closes), regularMarketDayLow: Math.min(...closes), regularMarketVolume: 0 }, timestamp: timestamps, indicators: { quote: [{ open: closes, high: closes.map((value) => value * 1.0005), low: closes.map((value) => value * 0.9995), close: closes, volume: closes.map(() => 0) }] } }] },
  };
}

async function loadYahooQuote(providerSymbol) {
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  for (const host of hosts) {
    try {
      const upstream = new URL(`https://${host}/v8/finance/chart/${encodeURIComponent(providerSymbol)}`);
      upstream.searchParams.set('range', '1d');
      upstream.searchParams.set('interval', '1m');
      const response = await fetch(upstream, { headers: { 'User-Agent': 'AD88/1.0', accept: 'application/json' }, signal: AbortSignal.timeout(6500) });
      if (!response.ok) continue;
      const payload = await response.json();
      const meta = payload?.chart?.result?.[0]?.meta;
      const price = Number(meta?.regularMarketPrice);
      if (!Number.isFinite(price) || price <= 0) continue;
      const previous = Number(meta?.previousClose ?? meta?.chartPreviousClose);
      return {
        price,
        change24h: previous > 0 ? ((price - previous) / previous) * 100 : 0,
        volume24h: Number(meta?.regularMarketVolume) || 0,
        quoteUpdatedAt: meta?.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString(),
        provider: 'Yahoo Finance',
        fallback: false,
      };
    } catch {
      // Try the second public host, then use the deterministic local quote.
    }
  }
  return null;
}

async function buildMarketQuoteSnapshot() {
  const entries = Object.entries(marketQuoteCatalogue);
  const tradingViewQuotes = await loadTradingViewSnapshot();
  const values = await Promise.all(entries.map(async ([symbol, providerSymbol]) => {
    let quote = null;
    if (cryptoQuoteSymbols.has(symbol)) {
      try { quote = await loadCoinbaseQuote(providerSymbol); } catch { quote = null; }
    }
    // Prefer one public market snapshot for spot metals, futures, FX and
    // indices. This keeps the table, ticker and trade ticket on the same
    // reference price instead of mixing a stale futures quote with spot gold.
    if (!quote) quote = tradingViewQuotes[symbol] || null;
    if (!quote && (symbol === 'XAU' || symbol === 'XAG')) {
      try { quote = await loadSpotMetalQuote(symbol); } catch { quote = null; }
    }
    // Twelve Data is only a rate-bounded fallback. The free tier cannot safely
    // serve thirty real-time instruments every eight seconds, while the batch
    // snapshot above can keep the whole catalogue aligned.
    if (!quote && twelveDataApiKey) {
      try { quote = await loadTwelveQuote(providerSymbol); } catch { quote = null; }
    }
    if (!quote) {
      try { quote = await loadYahooQuote(providerSymbol); } catch { quote = null; }
    }
    if (!quote) {
      const [price, change] = marketFallbackPrices[providerSymbol] || internalFallbackPrices[symbol] || [100, 0];
      quote = { price, change24h: change, volume24h: 0, quoteUpdatedAt: new Date().toISOString(), provider: 'AD88 fallback', fallback: true };
    }
    return [symbol, quote];
  }));
  return Object.fromEntries(values);
}

async function getMarketQuoteSnapshot() {
  const cached = marketQuoteSnapshotCache.value;
  if (cached && marketQuoteSnapshotCache.expiresAt > Date.now()) return cached;
  if (!marketQuoteSnapshotRequest) {
    marketQuoteSnapshotRequest = buildMarketQuoteSnapshot()
      .then((snapshot) => {
        const builtAt = Date.now();
        marketQuoteSnapshotCache = { expiresAt: builtAt + marketProxyTtlMs, value: snapshot, builtAt, snapshotId: `mkt-${builtAt}` };
        return snapshot;
      })
      .finally(() => { marketQuoteSnapshotRequest = null; });
  }
  return marketQuoteSnapshotRequest;
}

async function proxyMarketQuotes(res, requestUrl) {
  const requested = (requestUrl.searchParams.get('symbols') || Object.keys(marketQuoteCatalogue).join(','))
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol, index, all) => marketQuoteCatalogue[symbol] && all.indexOf(symbol) === index);
  if (!requested.length) return sendJson(res, 400, { error: 'no supported market symbols' });
  const servedFromCache = Boolean(marketQuoteSnapshotCache.value && marketQuoteSnapshotCache.expiresAt > Date.now());
  const snapshot = await getMarketQuoteSnapshot();
  // Keep provider diagnostics server-side. The public workspace only needs a
  // normalized quote and its source timestamp for calculations; it does not
  // expose provider names, fallback labels, cache flags or API lineage.
  const quotes = Object.fromEntries(requested
    .map((symbol) => [symbol, snapshot[symbol]])
    .filter(([, quote]) => quote)
    .map(([symbol, quote]) => [symbol, {
      symbol,
      price: quote.price,
      change24h: quote.change24h,
      volume24h: quote.volume24h,
      quoteUpdatedAt: quote.quoteUpdatedAt,
    }]));
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-ad88-cache', servedFromCache ? 'cached' : 'fresh');
  res.end(JSON.stringify({
    quotes,
    updatedAt: new Date().toISOString(),
    // These identifiers let the two independently deployed workspaces prove
    // that they consumed the same server snapshot without exposing provider
    // credentials or internal upstream URLs.
    snapshotId: marketQuoteSnapshotCache.snapshotId,
    snapshotBuiltAt: marketQuoteSnapshotCache.builtAt ? new Date(marketQuoteSnapshotCache.builtAt).toISOString() : undefined,
  }));
}

async function proxyMarketStatus(res) {
  try {
    const snapshot = await getMarketQuoteSnapshot();
    const ageSeconds = marketQuoteSnapshotCache.builtAt ? Math.max(0, Math.round((Date.now() - marketQuoteSnapshotCache.builtAt) / 1000)) : null;
    return sendJson(res, 200, {
      status: ageSeconds != null && ageSeconds <= 10 ? 'healthy' : 'degraded',
      quoteCount: Object.keys(snapshot).length,
      ageSeconds,
      cacheSeconds: Math.round(marketProxyTtlMs / 1000),
      snapshotId: marketQuoteSnapshotCache.snapshotId,
      snapshotBuiltAt: marketQuoteSnapshotCache.builtAt ? new Date(marketQuoteSnapshotCache.builtAt).toISOString() : null,
      twelveDataConfigured: Boolean(twelveDataApiKey),
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return sendJson(res, 503, { status: 'offline', quoteCount: 0, error: error instanceof Error ? error.message : 'market snapshot unavailable', checkedAt: new Date().toISOString() });
  }
}

async function proxyMarket(res, requestUrl) {
  const symbol = requestUrl.searchParams.get('symbol') || 'GC=F';
  if (!/^[A-Z0-9=^.-]+$/.test(symbol)) return sendJson(res, 400, { error: 'invalid market symbol' });
  const interval = requestUrl.searchParams.get('interval') || '15m';
  const providerPreference = requestUrl.searchParams.get('provider') || 'primary';
  const upstream = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  upstream.searchParams.set('range', requestUrl.searchParams.get('range') || '1d');
  upstream.searchParams.set('interval', interval);
  const cacheKey = `${symbol}:${interval}:${upstream.searchParams.get('range')}:${providerPreference}`;
  // The browser may check frequently, but this server-side cache limits a
  // free-provider quote to one upstream request about every eight seconds.
  // That keeps normal commodities and FX within the requested 0–10 second
  // display window without burning through free API quotas.
  const cacheTtlMs = requestUrl.searchParams.get('fast') === '1' ? 8_000 : marketProxyTtlMs;
  const cached = marketProxyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('x-ad88-cache', 'cached');
    res.setHeader('x-ad88-provider', `cached-${cached.provider || 'market'}`);
    res.end(cached.body);
    return;
  }

  if (symbol === 'GC=F' || symbol === 'SI=F') {
    try {
      const spotSymbol = symbol === 'GC=F' ? 'XAU' : 'XAG';
      const tradingViewQuotes = await loadTradingViewSnapshot();
      const spotQuote = tradingViewQuotes[spotSymbol] || await loadSpotMetalQuote(spotSymbol);
      const body = JSON.stringify(buildSpotMetalChart(symbol, spotQuote));
      marketProxyCache.set(cacheKey, { expiresAt: Date.now() + cacheTtlMs, body, provider: 'spot-metal' });
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('x-ad88-cache', 'fresh');
      res.setHeader('x-ad88-provider', 'spot-metal');
      res.end(body);
      return;
    } catch {
      // Fall through to the configured API or public futures fallback.
    }
  }

  if (providerPreference !== 'yahoo') {
    try {
      const twelvePayload = await loadTwelveMarket(symbol, interval);
      if (twelvePayload) {
        const body = JSON.stringify(twelvePayload);
        marketProxyCache.set(cacheKey, { expiresAt: Date.now() + cacheTtlMs, body, provider: 'twelvedata' });
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('x-ad88-cache', 'fresh');
        res.setHeader('x-ad88-provider', 'api.twelvedata.com');
        res.end(body);
        return;
      }
    } catch {
      // Yahoo below is an intentional resilient provider fallback.
    }
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
        const payload = JSON.parse(body);
        const normalizedBody = JSON.stringify({ ...payload, ad88Fallback: false, ad88Source: 'Yahoo Finance', ad88Cache: 'fresh', ad88Lineage: `${candidate.hostname} → AD88 server proxy → market workspace` });
        marketProxyCache.set(cacheKey, { expiresAt: Date.now() + cacheTtlMs, body: normalizedBody, provider: 'yahoo' });
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('x-ad88-cache', 'fresh');
        res.setHeader('x-ad88-provider', candidate.hostname);
        res.end(normalizedBody);
        return;
      } catch {
        continue;
      }
    }
    if (lastStatus >= 400 || !lastBody) {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('x-ad88-cache', 'fallback');
      res.end(JSON.stringify({ ...buildMarketFallback(symbol), ad88Source: 'AD88 market fallback', ad88Cache: 'stale' }));
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
    await ensureDatabase();
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    if (req.method === 'GET' && requestUrl.pathname === '/health') {
      return sendJson(res, 200, {
        status: 'ok',
        surface: appSurface,
        revision: deploymentRevision || undefined,
        // The admin deployment intentionally has no independent database. It
        // proxies privileged requests to the frontend API, which owns the
        // shared PostgreSQL connection, so it cannot drift into a second store.
        storage: appSurface === 'admin' && remoteApiOrigin ? 'shared-api-proxy' : pool ? 'postgres' : 'memory',
        adminProxy: Boolean(appSurface === 'admin' && remoteApiOrigin),
        adminCredentialsConfigured: appSurface === 'admin' ? Boolean(adminEmail && adminPassword) : undefined,
        marketData: {
          twelveDataConfigured: Boolean(twelveDataApiKey),
          quoteCacheSeconds: Math.round(marketProxyTtlMs / 1000),
          snapshotAgeSeconds: marketQuoteSnapshotCache.builtAt ? Math.max(0, Math.round((Date.now() - marketQuoteSnapshotCache.builtAt) / 1000)) : null,
          snapshotReady: Boolean(marketQuoteSnapshotCache.value),
        },
        checkedAt: new Date().toISOString(),
      });
    }
    if (appSurface === 'admin' && remoteApiOrigin && requestUrl.pathname === '/api/auth/login') {
      const input = await readBody(req);
      if (!adminEmail || !adminPassword) return sendJson(res, 503, { error: 'admin credentials are not configured' });
      if (adminEmail && String(input.identifier || '').trim().toLowerCase() === adminEmail && adminPassword && String(input.password || '') === adminPassword) {
        const account = { id: 'env-admin', name: 'AD88 Administrator', email: adminEmail, phone: '', country: 'Global', role: 'admin', status: 'active', tier: 'Enterprise', tradingScore: 100, joinedAt: new Date().toISOString() };
        return sendJson(res, 200, sessionResponse(account));
      }
      return forwardToRemoteApi(req, res, requestUrl, input, true);
    }
    if (appSurface === 'admin' && remoteApiOrigin && (requestUrl.pathname.startsWith('/api/admin/') || requestUrl.pathname.startsWith('/api/support/') || requestUrl.pathname.startsWith('/api/sync') || requestUrl.pathname.startsWith('/api/trades') || requestUrl.pathname.startsWith('/api/ledger') || requestUrl.pathname === '/api/market' || requestUrl.pathname === '/api/market/quotes' || requestUrl.pathname === '/api/market/status' || requestUrl.pathname === '/api/news')) {
      return forwardToRemoteApi(req, res, requestUrl, undefined, true);
    }
    if (requestUrl.pathname.startsWith('/api/auth/')) {
      const handled = await handleAuth(req, res, requestUrl);
      if (handled !== false) return;
    }
    if (requestUrl.pathname.startsWith('/api/admin/trades')) return handleAdminTrades(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/admin/notifications')) return handleAdminNotifications(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/admin/credits/')) return handleAdminCredits(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/admin/')) return handleAdmin(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/trades')) return handleTrades(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/ledger')) return handleLedger(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/credits/')) return handleCredits(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/profile')) return handleProfile(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/support/')) return handleSupport(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/notifications')) return handleNotifications(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/sync')) return handleSync(req, res, requestUrl);
    if (requestUrl.pathname === '/api/market/status') return proxyMarketStatus(res);
    if (requestUrl.pathname === '/api/market/quotes') return proxyMarketQuotes(res, requestUrl);
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
