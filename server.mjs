import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

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
// A one-way quote-ingest key for an optional user-hosted MT5 Expert Advisor.
// It is deliberately separate from AUTH_SECRET and never reaches a browser,
// the admin service, or source control. The bridge only accepts reference
// prices; it has no trading-command or account-credential path.
const mt5IngestSecret = (process.env.MT5_INGEST_SECRET || '').trim();
// Funding account details are retained only for an authenticated funding
// review. Encrypt them before they touch PostgreSQL or the local memory store;
// the browser receives a masked value unless it is an administrator session.
const fundingDataEncryptionKey = createHash('sha256')
  .update(`${authSecret}:ad88-funding-data:v1`)
  .digest();
const memoryAccounts = new Map();
const memoryState = new Map();
const memorySupportMessages = [];
const memoryTradeEvents = [];
const memoryCreditAccounts = new Map();
const memoryCreditRequests = new Map();
const memoryBlacklist = new Map();
const memoryNotifications = [];
const memoryLedgerEntries = [];
const memoryFundingRequests = new Map();
const memoryTimedScenarios = new Map();
const memoryContentSettings = new Map();
const registrationChallenges = new Map();
const marketProxyCache = new Map();
const yahooQuoteCache = new Map();
// Quotes for instruments retired from the new-order catalogue. They are only
// loaded when an existing historical paper position needs to be valued or
// closed, so the active 30-instrument snapshot remains bounded.
const legacyPaperQuoteCache = new Map();
// Keep the server snapshot inside the requested 0–10 second display window.
// The browser polls every two seconds; this cache prevents duplicate fan-out
// requests while still allowing a fresh public quote cycle at that cadence.
const marketProxyTtlMs = 2_000;
const yahooQuoteTtlMs = 8_000;
const yahooNegativeQuoteTtlMs = 60_000;
const mt5QuoteCache = new Map();
const mt5QuoteTtlMs = 20_000;
const marketStreamClients = new Set();
let marketStreamBroadcastTimer = null;
let mt5QuoteRevision = 0;
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
const spotMetalTtlMs = 2_000;
// Funding uses a once-daily MYR reference quote. It exists only to calculate
// paper-U review requests and is not a payment or wallet integration.
const fundingRateTtlMs = 24 * 60 * 60 * 1000;
let fundingRateCache = { expiresAt: 0, value: null };
let fundingRateRequest = null;
const fundingBankOptions = new Set([
  'Maybank', 'CIMB Bank', 'Public Bank', 'RHB Bank', 'Hong Leong Bank', 'Bank Islam',
  'AmBank', 'Alliance Bank', 'UOB Malaysia', 'OCBC Malaysia', 'Standard Chartered', 'Bank Muamalat',
]);
let marketQuoteSnapshotCache = { expiresAt: 0, value: null, builtAt: 0, snapshotId: '' };
let marketQuoteSnapshotRequest = null;
const newsProxyCache = new Map();
const newsProxyTtlMs = 5 * 60_000;
const marketFallbackPrices = {
  'GC=F': [4680.6, 0.42], 'SI=F': [54.18, -0.18], 'CL=F': [79.22, 1.1], 'NG=F': [2.86, -1.42], 'HG=F': [4.31, 0.68],
  SCCO: [94.3, 0.36], 'BZ=F': [82.14, 0.62], 'HO=F': [2.36, 0.48], 'RB=F': [2.19, -0.37], 'LGO=F': [1281.25, -2.33], 'PL=F': [982.4, 0.21], 'PA=F': [1028.5, -0.38], 'ZC=F': [432.25, 0.15],
  'ZW=F': [548.5, -0.27], 'KC=F': [312.8, 0.74], 'SB=F': [18.72, 0.36], 'CC=F': [8275, -0.58], 'CT=F': [68.4, 0.21], 'ZO=F': [384.5, -0.14], 'LBS=F': [612.2, 0.44],
  'EURUSD=X': [1.0912, -0.12], 'GBPUSD=X': [1.2748, 0.21], 'NZDUSD=X': [0.5984, -0.16], 'CHF=X': [0.8842, 0.08], 'EURGBP=X': [0.8567, 0.05], 'EURJPY=X': [170.64, -0.04], 'GBPJPY=X': [199.22, 0.06], 'EURCHF=X': [0.9641, -0.07],
  'JPY=X': [156.42, 0.09], 'AUDUSD=X': [0.6543, -0.08], 'CAD=X': [1.3714, 0.04], 'CNH=X': [7.2584, 0.02], 'SGD=X': [1.3412, -0.03], 'HKD=X': [7.8114, 0.01], 'TRY=X': [41.08, 0.13], 'ZAR=X': [17.92, -0.11], '^GSPC': [5615.2, 0.34], '^NDX': [19842.1, 0.48], '^GDAXI': [18422.6, 0.26], '^FTSE': [8320.5, 0.31], '^FCHI': [7548.3, 0.18], '^N225': [39110, 0.44], '^HSI': [17840, -0.22], '^DJI': [40610, 0.27], '^RUT': [2210, -0.16],
  'ZS=F': [1012.5, 0.18], 'ZM=F': [286.1, -0.24], 'ZL=F': [49.7, 0.11], 'LE=F': [195.2, -0.09], 'HE=F': [88.4, 0.25], 'OJ=F': [312.6, -0.41],
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

// Copy that is safe to edit from the administrator workspace. Keeping the
// default in the API layer means a new deployment still renders a complete
// message before the shared store has its first row, while PostgreSQL remains
// the source of truth once an administrator saves a revision.
const contentSettingDefaults = {
  'market.scenarioScale': {
    zh: '观察额度（USDT显示）',
    ms: 'Jumlah pemerhatian (paparan USDT)',
    en: 'Observation amount (USDT display)',
  },
  'market.scenarioScaleHint': {
    zh: '设置USDT。',
    ms: 'Tetapkan jumlah untuk rekod pemerhatian pasaran.',
    en: 'Set an amount to frame this market observation.',
  },
  'market.scenarioScaleNote': {
    zh: '最低为 10 USDT。',
    ms: ' minimum 10 USDT.',
    en: ' minimum 10 USDT.',
  },
  'market.observationSafety': {
    zh: 。',
    ms: '.',
    en: '',
  },
  'market.scenarioWorkspaceSafety': {
    zh: '。',
    ms: '.',
    en:.',
  },
  'market.scenarioDialogSafety': {
    zh: '。',
    ms: '.',
    en: '.',
  },
  'market.scenarioAdminNoteLabel': {
    zh: '备注',
    ms: 'Nota',
    en: 'Admin note',
  },
  'funding.processingNote': {
    zh: '银行转账目前由客服人工协助处理；提交后会在客服中心跟进申请。',
    ms: 'Pemindahan bank kini dibantu secara manual oleh Khidmat Pelanggan; selepas dihantar, permintaan akan disusuli di Pusat Sokongan.',
    en: 'Bank transfers are currently assisted manually by Client Support; after submission, the request is followed up in the Support Center.',
  },
  'funding.reviewSafety': {
    zh: '用于内部审核记录；不会收款、自动付款或创建银行与钱包指令。',
    ms: 'Untuk rekod semakan dalaman; tiada kutipan, bayaran automatik atau arahan bank dan dompet dibuat.',
    en: 'For internal review records; no collection, automatic payout, or bank or wallet instruction is created.',
  },
};

// A previous release stored these exact starter values in PostgreSQL. Migrate
// only those untouched defaults so an administrator's custom copy is never
// overwritten during deployment.
const legacyContentSettingDefaults = {
  'market.scenarioScale': {
    zh: '观察额度（USDT显示）',
    ms: 'Jumlah pemerhatian (paparan USDT)',
    en: 'Observation amount (USDT display)',
  },
  'market.scenarioScaleHint': {
    zh: '最低为 10 USDT；',
    ms: ' minimum 10 USDT',
    en: 'minimum 10 USDT',
  },
  'market.observationSafety': {
    zh: '。',
    ms: '.',
    en: '.',
  },
};

function normalizeContentSetting(row, includeAudit = false) {
  const key = String(row?.key || '').trim();
  const fallback = contentSettingDefaults[key] || { zh: '', ms: '', en: '' };
  const setting = {
    key,
    values: {
      zh: String(row?.zh_value ?? row?.zhValue ?? fallback.zh),
      ms: String(row?.ms_value ?? row?.msValue ?? fallback.ms),
      en: String(row?.en_value ?? row?.enValue ?? fallback.en),
    },
    updatedAt: row?.updated_at ?? row?.updatedAt ?? undefined,
  };
  if (includeAudit) setting.updatedBy = row?.updated_by ?? row?.updatedBy ?? '';
  return setting;
}

function contentSettingsSource(settings) {
  const timestamps = settings.map((item) => item.updatedAt).filter(Boolean).sort();
  return {
    provider: pool ? 'VENTURE FUNDS shared PostgreSQL content store' : 'VENTURE FUNDS default content bundle',
    mode: pool ? 'api' : 'mock',
    updatedAt: timestamps.at(-1) || new Date().toISOString(),
    cacheState: pool ? 'fresh' : 'cached',
    health: pool ? 'healthy' : 'degraded',
    lineage: pool ? 'PostgreSQL → frontend and administrator workspaces' : 'versioned defaults → frontend and administrator workspaces',
  };
}

async function listContentSettings(includeAudit = false) {
  const keys = Object.keys(contentSettingDefaults);
  if (pool) {
    const result = await pool.query('SELECT key, zh_value, ms_value, en_value, updated_at, updated_by FROM ad88_content_settings WHERE key = ANY($1::text[])', [keys]);
    const stored = new Map(result.rows.map((row) => [row.key, row]));
    return keys.map((key) => normalizeContentSetting(stored.get(key) || { key }, includeAudit));
  }
  return keys.map((key) => normalizeContentSetting(memoryContentSettings.get(key) || { key }, includeAudit));
}

function normalizeEditableContent(value, fallback) {
  const text = String(value ?? '').trim().slice(0, 500);
  return text || fallback;
}

function validateObservationSafetyCopy(values) {
  const zh = String(values?.zh || '').trim();
  const ms = String(values?.ms || '').trim();
  const en = String(values?.en || '').trim();
  if (!zh || !ms || !en) return 'Chinese, Bahasa Melayu and English copy are all required';
  const unsafeClaim = /((?:|)||||guarantee(?:d)?\s+(?:profit|return)|risk[-\s]?free|untung\s+dijamin|tanpa\s+risiko)/iu;
  if (unsafeClaim.test(`${zh}\n${ms}\n${en}`)) return 'The market-observation notice cannot include profit guarantees or risk-free claims';
  const msSafe = /(pemerhatian|pasaran)/iu.test(ms) && /(tiada|tidak|bukan).{0,100}(pesanan|dagangan|baki)/iu.test(ms);
  const enSafe = /(market|observation)/iu.test(en) && /\b(no|not|without)\b.{0,100}\b(live|order|orders|balance|balances)\b/iu.test(en);
  if (!zhSafe || !msSafe || !enSafe) return 'The notice must keep the market-observation, no-live-order, and no-balance-change disclosure in every language';
  return '';
}

function validateFundingSafetyCopy(values) {
  const zh = String(values?.zh || '').trim();
  const ms = String(values?.ms || '').trim();
  const en = String(values?.en || '').trim();
  if (!zh || !ms || !en) return 'Chinese, Bahasa Melayu and English copy are all required';
  const unsafeClaim = /|guarantee(?:d)?\s+(?:profit|return)|risk[-\s]?free|untung\s+dijamin|tanpa\s+risiko)/iu;
  if (unsafeClaim.test(`${zh}\n${ms}\n${en}`)) return 'The funding notice cannot include profit guarantees or risk-free claims';
  const zhSafe = /(|)/u.test(zh) && /(会).{0,100}(收款|付款|指令|余额|订单|交易)/u.test(zh);
  const msSafe = /(semakan|rekod|dalaman)/iu.test(ms) && /(tiada|tidak|bukan).{0,120}(kutipan|bayaran|arahan|baki|pesanan|dagangan)/iu.test(ms);
  const enSafe = /(review|record|internal)/iu.test(en) && /\b(no|not|without)\b.{0,120}\b(collection|payout|payment|bank|wallet|instruction|order|balance)\b/iu.test(en);
  if (!zhSafe || !msSafe || !enSafe) return 'The funding notice must keep an internal-review and no-payment-instruction disclosure in every language';
  return '';
}

function validateObservationContent(key, values) {
  if (new Set(['market.observationSafety', 'market.scenarioWorkspaceSafety', 'market.scenarioDialogSafety']).has(key)) return validateObservationSafetyCopy(values);
  if (key === 'funding.reviewSafety') return validateFundingSafetyCopy(values);
  const text = `${values?.zh || ''}\n${values?.ms || ''}\n${values?.en || ''}`.trim();
  if (!text) return 'Chinese, Bahasa Melayu and English copy are all required';
  if (/((?:|)||||guarantee(?:d)?\s+(?:profit|return)|risk[-\s]?free|untung\s+dijamin|tanpa\s+risiko)/iu.test(text)) {
    return 'Market-observation copy cannot include profit guarantees or risk-free claims';
  }
  return '';
}

function prepareContentSetting(key, input) {
  const fallback = contentSettingDefaults[key];
  if (!fallback) return { error: 'content setting not found' };
  const values = {
    zh: normalizeEditableContent(input?.values?.zh, fallback.zh),
    ms: normalizeEditableContent(input?.values?.ms, fallback.ms),
    en: normalizeEditableContent(input?.values?.en, fallback.en),
  };
  const validationError = validateObservationContent(key, values);
  if (validationError) return { error: validationError };
  return { key, values };
}

async function saveContentSettingsBatch(input, session) {
  const rawSettings = Array.isArray(input?.settings)
    ? input.settings
    : Object.entries(input?.values || {}).map(([key, values]) => ({ key, values }));
  if (!rawSettings.length) return { error: 'at least one content setting is required' };

  const prepared = [];
  const seen = new Set();
  for (const item of rawSettings) {
    const key = String(item?.key || '').trim();
    if (seen.has(key)) return { error: 'duplicate content setting key' };
    seen.add(key);
    const result = prepareContentSetting(key, item);
    if (result.error) return result;
    prepared.push(result);
  }

  const updatedAt = new Date().toISOString();
  const updatedBy = String(session?.email || session?.name || 'VENTURE FUNDS Administrator').trim().slice(0, 240);
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const saved = [];
      for (const item of prepared) {
        const result = await client.query(`
          INSERT INTO ad88_content_settings (key, zh_value, ms_value, en_value, updated_at, updated_by)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (key) DO UPDATE SET
            zh_value = EXCLUDED.zh_value,
            ms_value = EXCLUDED.ms_value,
            en_value = EXCLUDED.en_value,
            updated_at = EXCLUDED.updated_at,
            updated_by = EXCLUDED.updated_by
          RETURNING key, zh_value, ms_value, en_value, updated_at, updated_by
        `, [item.key, item.values.zh, item.values.ms, item.values.en, updatedAt, updatedBy]);
        saved.push(normalizeContentSetting(result.rows[0], true));
      }
      await client.query('COMMIT');
      return { settings: saved };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  const saved = prepared.map((item) => {
    const row = { key: item.key, zh_value: item.values.zh, ms_value: item.values.ms, en_value: item.values.en, updated_at: updatedAt, updated_by: updatedBy };
    memoryContentSettings.set(item.key, row);
    return normalizeContentSetting(row, true);
  });
  return { settings: saved };
}

async function saveContentSetting(key, input, session) {
  const result = await saveContentSettingsBatch({ settings: [{ key, values: input?.values }] }, session);
  return result.settings?.[0] ?? null;
}

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
    tier: row.role === 'admin' ? 'Enterprise' : row.tier === 'Core' || !row.tier ? 'Professional' : row.tier,
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

function safeSecretEqual(value, expected) {
  if (!value || !expected) return false;
  const actualBuffer = Buffer.from(String(value));
  const expectedBuffer = Buffer.from(String(expected));
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
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
      return { sub: 'env-admin', email: adminEmail, name: 'VENTURE FUNDS Administrator', phone: '', role: 'admin' };
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

function pruneRegistrationChallenges() {
  const now = Date.now();
  for (const [id, challenge] of registrationChallenges) {
    if (challenge.expiresAt <= now || challenge.attempts >= 5) registrationChallenges.delete(id);
  }
}

function createRegistrationChallenge() {
  pruneRegistrationChallenges();
  const useSubtraction = Math.random() >= 0.5;
  const left = Math.floor(Math.random() * 10) + (useSubtraction ? 5 : 1);
  const right = useSubtraction
    ? Math.floor(Math.random() * Math.max(left, 1))
    : Math.floor(Math.random() * 10) + 1;
  const answer = useSubtraction ? left - right : left + right;
  const challengeId = randomUUID();
  const expiresAt = Date.now() + 10 * 60 * 1000;
  registrationChallenges.set(challengeId, { answer: String(answer), expiresAt, attempts: 0 });
  return { challengeId, prompt: `${left} ${useSubtraction ? '−' : '+'} ${right} = ?`, expiresAt: new Date(expiresAt).toISOString() };
}

function validateRegistrationChallenge(input) {
  pruneRegistrationChallenges();
  const id = String(input.challengeId || '').trim();
  const answer = String(input.challengeAnswer || '').trim();
  const challenge = registrationChallenges.get(id);
  if (!challenge || !/^-?\d{1,3}$/.test(answer)) return { error: 'registration challenge failed' };
  challenge.attempts += 1;
  if (challenge.answer !== answer) {
    if (challenge.attempts >= 5) registrationChallenges.delete(id);
    return { error: 'registration challenge failed' };
  }
  registrationChallenges.delete(id);
  return { ok: true };
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
      tier TEXT NOT NULL DEFAULT 'Professional',
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
    CREATE TABLE IF NOT EXISTS ad88_funding_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      email TEXT NOT NULL,
      kind TEXT NOT NULL,
      method TEXT NOT NULL,
      bank_name TEXT,
      account_holder TEXT,
      account_reference TEXT,
      amount_myr NUMERIC NOT NULL,
      amount_u NUMERIC NOT NULL,
      rate NUMERIC NOT NULL,
      base_rate NUMERIC NOT NULL,
      rate_source TEXT NOT NULL,
      rate_updated_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      customer_note TEXT NOT NULL DEFAULT '',
      reviewed_at TIMESTAMPTZ,
      reviewer TEXT,
      reviewer_note TEXT,
      support_required BOOLEAN NOT NULL DEFAULT FALSE,
      ledger_entry_id TEXT
    );
    CREATE INDEX IF NOT EXISTS ad88_funding_requests_user_created_idx ON ad88_funding_requests (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS ad88_funding_requests_status_created_idx ON ad88_funding_requests (status, created_at DESC);
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
    CREATE TABLE IF NOT EXISTS ad88_timed_scenarios (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_email TEXT NOT NULL,
      symbol TEXT NOT NULL,
      direction TEXT NOT NULL,
      observation_points NUMERIC NOT NULL,
      duration_seconds INTEGER NOT NULL,
      reference_price NUMERIC NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      result TEXT,
      settlement_price NUMERIC,
      settled_at TIMESTAMPTZ,
      admin_note TEXT NOT NULL DEFAULT '',
      admin_note_updated_at TIMESTAMPTZ,
      admin_note_updated_by TEXT,
      voided_at TIMESTAMPTZ,
      voided_by TEXT,
      void_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ad88_timed_scenarios_user_created_idx ON ad88_timed_scenarios (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS ad88_timed_scenarios_status_expiry_idx ON ad88_timed_scenarios (status, expires_at ASC);
    CREATE TABLE IF NOT EXISTS ad88_content_settings (
      key TEXT PRIMARY KEY,
      zh_value TEXT NOT NULL,
      ms_value TEXT NOT NULL,
      en_value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by TEXT NOT NULL DEFAULT ''
    );
    ALTER TABLE ad88_support_messages ADD COLUMN IF NOT EXISTS user_phone TEXT NOT NULL DEFAULT '';
    ALTER TABLE ad88_funding_requests ADD COLUMN IF NOT EXISTS customer_note TEXT NOT NULL DEFAULT '';
    ALTER TABLE ad88_trade_events ADD COLUMN IF NOT EXISTS pnl NUMERIC;
    ALTER TABLE ad88_timed_scenarios ADD COLUMN IF NOT EXISTS admin_note TEXT NOT NULL DEFAULT '';
    ALTER TABLE ad88_timed_scenarios ADD COLUMN IF NOT EXISTS admin_note_updated_at TIMESTAMPTZ;
    ALTER TABLE ad88_timed_scenarios ADD COLUMN IF NOT EXISTS admin_note_updated_by TEXT;
    `);
    // Older deployments used one shared observation notice. Seed the two
    // explicit locations only when they do not already have an administrator
    // revision, preserving any copy that was previously saved.
    await candidate.query(`
      INSERT INTO ad88_content_settings (key, zh_value, ms_value, en_value, updated_at, updated_by)
      SELECT 'market.scenarioWorkspaceSafety', zh_value, ms_value, en_value, updated_at, updated_by
      FROM ad88_content_settings WHERE key = 'market.observationSafety'
      ON CONFLICT (key) DO NOTHING;
      INSERT INTO ad88_content_settings (key, zh_value, ms_value, en_value, updated_at, updated_by)
      SELECT 'market.scenarioDialogSafety', zh_value, ms_value, en_value, updated_at, updated_by
      FROM ad88_content_settings WHERE key = 'market.observationSafety'
      ON CONFLICT (key) DO NOTHING;
    `);
    for (const contentKey of Object.keys(contentSettingDefaults)) {
      const legacyCopy = legacyContentSettingDefaults[contentKey];
      const currentCopy = contentSettingDefaults[contentKey];
      if (!legacyCopy || !currentCopy) continue;
      await candidate.query(
        `UPDATE ad88_content_settings
         SET zh_value=$5, ms_value=$6, en_value=$7, updated_at=NOW()
         WHERE key=$1 AND zh_value=$2 AND ms_value=$3 AND en_value=$4`,
        [contentKey, legacyCopy.zh, legacyCopy.ms, legacyCopy.en, currentCopy.zh, currentCopy.ms, currentCopy.en],
      );
    }
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
    await pool.query('DELETE FROM ad88_funding_requests WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM ad88_timed_scenarios WHERE user_id = $1', [id]);
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
      memoryFundingRequests.forEach((item, key) => { if (item.userId === id) memoryFundingRequests.delete(key); });
      memoryTimedScenarios.forEach((item, key) => { if (item.userId === id) memoryTimedScenarios.delete(key); });
      memoryLedgerEntries.splice(0, memoryLedgerEntries.length, ...memoryLedgerEntries.filter((item) => item.userId !== id));
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
  if (req.method === 'GET' && requestUrl.pathname === '/api/auth/registration-challenge') {
    if (appSurface === 'admin') return sendJson(res, 404, { error: 'not found' });
    return sendJson(res, 200, createRegistrationChallenge());
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/auth/register') {
    if (appSurface === 'admin') return sendJson(res, 403, { error: 'the administrator service does not accept public registration' });
    const body = await readBody(req);
    const input = validateCredentials(body);
    if (input.error) return sendJson(res, 400, input);
    const challenge = validateRegistrationChallenge(body);
    if (challenge.error) return sendJson(res, 400, challenge);
    if (await isBlacklisted(input.email, input.phone)) return sendJson(res, 403, { error: 'registration is blocked' });
    if (await accountExists(input.email, input.phone)) return sendJson(res, 409, { error: 'email or phone already exists' });
    const account = await saveAccount({ id: randomUUID(), name: input.name, email: input.email, phone: input.phone, country: input.country, role: 'user', status: 'active', tier: 'Professional', tradingScore: 0, joinedAt: new Date().toISOString() }, input.password);
    await getOrCreateCreditAccount({ sub: account.id, name: account.name, email: account.email });
    await createNotification(account.id, 'system', 'Account approved', 'Your account is active and has synchronized to the administrator review record.', 'success', '/app/settings');
    return sendJson(res, 201, sessionResponse(account));
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/auth/login') {
    const input = await readBody(req);
    const identifier = String(input.identifier || '').trim();
    const password = String(input.password || '');
    if (appSurface === 'admin' && adminEmail && identifier.toLowerCase() === adminEmail && adminPassword && password === adminPassword) {
      const account = { id: 'env-admin', name: 'VENTURE FUNDS Administrator', email: adminEmail, phone: '', country: 'Global', role: 'admin', status: 'active', tier: 'Enterprise', tradingScore: 100, joinedAt: new Date().toISOString() };
      return sendJson(res, 200, sessionResponse(account));
    }
    const account = await findAccount(identifier);
    if (appSurface === 'admin' && (!account || account.role !== 'admin')) return sendJson(res, 403, { error: 'only administrator accounts may access this service' });
    const adminBridge = req.headers['x-ad88-admin-bridge'] === authSecret || (adminBridgeToken && req.headers['x-ad88-admin-bridge'] === adminBridgeToken);
    if (appSurface === 'frontend' && account?.role === 'admin' && !adminBridge) return sendJson(res, 403, { error: 'administrators must use the separate admin address' });
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
        id: 'env-admin', name: 'VENTURE FUNDS Administrator', email: adminEmail,
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
    reason: String(reason || 'Registration review was not approved').trim().slice(0, 240),
    blacklistedAt: new Date().toISOString(),
    blacklistedBy: session.email || session.name || 'VENTURE FUNDS Admin',
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

async function handleContentSettings(req, res, requestUrl) {
  if (req.method === 'GET' && requestUrl.pathname === '/api/content-settings') {
    const settings = await listContentSettings();
    return sendJson(res, 200, { settings, source: contentSettingsSource(settings) });
  }
  return sendJson(res, 404, { error: 'content settings route not found' });
}

async function handleAdmin(req, res, requestUrl) {
  const session = requireSession(req, res, 'admin');
  if (!session) return true;
  if (req.method === 'GET' && requestUrl.pathname === '/api/admin/users') return sendJson(res, 200, await listAccounts());
  if (req.method === 'GET' && requestUrl.pathname === '/api/admin/blacklist') return sendJson(res, 200, await listBlacklistEntries());
  if (req.method === 'GET' && requestUrl.pathname === '/api/admin/content-settings') {
    const settings = await listContentSettings(true);
    return sendJson(res, 200, { settings, source: contentSettingsSource(settings) });
  }

  const contentMatch = requestUrl.pathname.match(/^\/api\/admin\/content-settings\/([^/]+)$/);
  if ((req.method === 'PUT' || req.method === 'PATCH') && contentMatch) {
    let key = '';
    try {
      key = decodeURIComponent(contentMatch[1]);
    } catch {
      return sendJson(res, 400, { error: 'invalid content setting key' });
    }
    const body = await readBody(req);
    const validationError = validateObservationContent(key, body?.values);
    if (validationError) return sendJson(res, 400, { error: validationError });
    const setting = await saveContentSetting(key, body, session);
    return setting ? sendJson(res, 200, setting) : sendJson(res, 404, { error: 'content setting not found' });
  }
  if ((req.method === 'PUT' || req.method === 'PATCH') && requestUrl.pathname === '/api/admin/content-settings') {
    const body = await readBody(req);
    const result = await saveContentSettingsBatch(body, session);
    if (result.error) return sendJson(res, 400, { error: result.error });
    return sendJson(res, 200, { settings: result.settings, source: contentSettingsSource(result.settings) });
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/admin/users') {
    const body = await readBody(req);
    const input = validateCredentials(body);
    if (input.error) return sendJson(res, 400, input);
    if (await isBlacklisted(input.email, input.phone)) return sendJson(res, 403, { error: 'registration is blocked' });
    if (await accountExists(input.email, input.phone)) return sendJson(res, 409, { error: 'email or phone already exists' });
    const requestedRole = body.role === 'admin' ? 'admin' : 'user';
    const account = await saveAccount({ id: randomUUID(), name: input.name, email: input.email, phone: input.phone, country: input.country, role: requestedRole, status: 'active', tier: requestedRole === 'admin' ? 'Enterprise' : 'Professional', tradingScore: requestedRole === 'admin' ? 100 : 0, joinedAt: new Date().toISOString() }, input.password);
    await getOrCreateCreditAccount({ sub: account.id, name: account.name, email: account.email });
    await createNotification(account.id, 'system', 'Account created by administrator', 'This account was created in the administrator workspace and is active.', 'success', '/app/settings');
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

function normalizePaperPosition(value, session) {
  const symbol = String(value?.symbol || '').trim().toUpperCase();
  const spec = getPaperInstrumentSpec(symbol);
  const side = value?.side === 'short' ? 'short' : value?.side === 'long' ? 'long' : null;
  const lots = Number(value?.lots);
  const entryPrice = Number(value?.entryPrice);
  const savedLeverage = Number(value?.leverage);
  // The server now owns a conservative, small-entry paper profile. Retain an
  // older, higher leverage value if it already exists, but never keep a
  // legacy low-leverage position that would turn a 0.01 lot into hundreds of U.
  const leverage = Number.isFinite(savedLeverage) && savedLeverage > spec.defaultLeverage
    ? Math.min(1_000, savedLeverage)
    : spec.defaultLeverage;
  if (!isPaperPositionSymbol(symbol) || !side || !Number.isFinite(lots) || lots < spec.minimumLots || lots > 1_000 || !Number.isFinite(entryPrice) || entryPrice <= 0) return null;
  const totalLots = Number(lots.toFixed(2));
  const rawRemaining = Number(value?.remainingLots ?? totalLots);
  const remainingLots = Math.min(totalLots, Math.max(0, Number.isFinite(rawRemaining) ? rawRemaining : totalLots));
  const closedLots = Math.min(totalLots, Math.max(0, Number(value?.closedLots ?? totalLots - remainingLots) || 0));
  const status = remainingLots <= 0 ? 'closed' : remainingLots < totalLots ? 'partial' : 'open';
  const notional = totalLots * spec.contractSize * entryPrice;
  return {
    id: String(value?.id || randomUUID()).slice(0, 120),
    userId: session.sub,
    userName: session.name,
    symbol,
    side,
    lots: totalLots,
    contractSize: spec.contractSize,
    leverage,
    entryPrice,
    markPrice: Number(value?.markPrice) || entryPrice,
    notional,
    margin: Number((notional / leverage).toFixed(2)),
    stopLoss: Number.isFinite(Number(value?.stopLoss)) && Number(value.stopLoss) > 0 ? Number(value.stopLoss) : undefined,
    takeProfit: Number.isFinite(Number(value?.takeProfit)) && Number(value.takeProfit) > 0 ? Number(value.takeProfit) : undefined,
    openedAt: value?.openedAt || new Date().toISOString(),
    remainingLots: Number(remainingLots.toFixed(2)),
    closedLots: Number(closedLots.toFixed(2)),
    status,
    closedAt: status === 'closed' ? value?.closedAt || new Date().toISOString() : undefined,
  };
}

async function readPaperPositionState(session) {
  let stored;
  if (pool) {
    const result = await pool.query("SELECT state_value FROM ad88_user_state WHERE user_id = $1 AND state_key = 'paperPositions' LIMIT 1", [session.sub]);
    stored = result.rows[0]?.state_value;
  } else {
    stored = memoryState.get(session.sub)?.paperPositions;
  }
  return Array.isArray(stored) ? stored : [];
}

function normalizePaperPositions(stored, session) {
  return stored
    .map((item) => normalizePaperPosition(item, session))
    .filter(Boolean);
}

async function getPaperPositions(session) {
  return normalizePaperPositions(await readPaperPositionState(session), session);
}

async function migratePaperMarginProfile(session) {
  const stored = await readPaperPositionState(session);
  const normalizedByIndex = stored.map((value) => normalizePaperPosition(value, session));
  const positions = normalizedByIndex.filter(Boolean);
  let releasedMargin = 0;
  let changed = false;
  stored.forEach((value, index) => {
    const position = normalizedByIndex[index];
    if (!position || position.status === 'closed' || (position.remainingLots ?? position.lots) <= 0) return;
    const previousMargin = Number(value?.margin);
    const openRatio = (position.remainingLots ?? position.lots) / position.lots;
    const previousReservedMargin = previousMargin * openRatio;
    const nextReservedMargin = position.margin * openRatio;
    if (Number.isFinite(previousReservedMargin) && previousReservedMargin > nextReservedMargin + 0.005) {
      releasedMargin += previousReservedMargin - nextReservedMargin;
      changed = true;
    }
  });
  if (!changed) return positions;
  // Preserve any malformed or unknown historic records verbatim instead of
  // silently deleting them during this risk-profile migration. Supported
  // legacy symbols below are normalized and remain trade-auditable.
  await writePaperPositions(session, stored.map((value, index) => normalizedByIndex[index] ?? value));
  const account = await getOrCreateCreditAccount(session);
  await updateCreditAccount({
    ...account,
    available: Math.min(account.balance, Math.max(0, Number((account.available + releasedMargin).toFixed(2)))),
    updatedAt: new Date().toISOString(),
  });
  return positions;
}

async function writePaperPositions(session, positions) {
  if (pool) {
    await pool.query("INSERT INTO ad88_user_state (user_id, state_key, state_value) VALUES ($1, 'paperPositions', $2::jsonb) ON CONFLICT (user_id, state_key) DO UPDATE SET state_value = EXCLUDED.state_value, updated_at = NOW()", [session.sub, JSON.stringify(positions)]);
  } else {
    const current = memoryState.get(session.sub) || {};
    current.paperPositions = positions;
    memoryState.set(session.sub, current);
  }
  return positions;
}

async function recordPaperTradeEvent(event) {
  if (pool) {
    await pool.query('INSERT INTO ad88_trade_events (id, position_id, user_id, user_name, user_email, symbol, side, action, lots, price, contract_size, leverage, margin, pnl, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)', [event.id, event.positionId ?? null, event.userId, event.userName, event.userEmail, event.symbol, event.side, event.action, event.lots, event.price, event.contractSize ?? null, event.leverage ?? null, event.margin ?? null, event.pnl ?? null, event.createdAt]);
  } else {
    memoryTradeEvents.push(event);
  }
  return normalizeTradeEvent(event);
}

async function getPaperMarketQuote(symbol) {
  const snapshot = overlayMt5Quotes(await getMarketQuoteSnapshot());
  let quote = snapshot[symbol];
  if (!quote && legacyPaperQuoteCatalogue[symbol]) {
    quote = await loadLegacyPaperQuote(symbol);
  }
  if (!quote || quote.fallback || !Number.isFinite(Number(quote.price)) || Number(quote.price) <= 0) {
    throw new Error('live paper quote unavailable');
  }
  return getPaperExecutionQuote(symbol, quote);
}

function paperTradeEvent(session, position, action, lots, price, margin, pnl) {
  return {
    id: randomUUID(),
    positionId: position.id,
    userId: session.sub,
    userName: session.name,
    userEmail: session.email,
    symbol: position.symbol,
    side: position.side,
    action,
    lots,
    price,
    contractSize: position.contractSize,
    leverage: position.leverage,
    margin,
    pnl,
    createdAt: new Date().toISOString(),
  };
}

async function closePaperPosition(session, positionId, requestedLots) {
  const positions = await getPaperPositions(session);
  const position = positions.find((item) => item.id === positionId && item.status !== 'closed' && (item.remainingLots ?? item.lots) > 0);
  if (!position) return { error: 'paper position not found', status: 404 };
  const remainingLots = Number(position.remainingLots ?? position.lots);
  const rawLots = requestedLots == null ? remainingLots : Number(requestedLots);
  const closeLots = Math.min(remainingLots, Math.max(0.01, Number(((Number.isFinite(rawLots) ? rawLots : remainingLots)).toFixed(2))));
  if (!Number.isFinite(closeLots) || closeLots <= 0) return { error: 'invalid paper close size', status: 400 };
  const quote = await getPaperMarketQuote(position.symbol);
  const exitPrice = position.side === 'long' ? quote.bid : quote.ask;
  const pnl = Number(((position.side === 'long' ? exitPrice - position.entryPrice : position.entryPrice - exitPrice) * position.contractSize * closeLots).toFixed(2));
  const releasedMargin = Number((position.margin * (closeLots / position.lots)).toFixed(2));
  const nextRemaining = Number(Math.max(0, remainingLots - closeLots).toFixed(2));
  const nextPositions = positions.map((item) => item.id !== position.id ? item : {
    ...item,
    markPrice: exitPrice,
    remainingLots: nextRemaining,
    closedLots: Number(((item.closedLots ?? 0) + closeLots).toFixed(2)),
    status: nextRemaining > 0 ? 'partial' : 'closed',
    closedAt: nextRemaining > 0 ? item.closedAt : new Date().toISOString(),
  });
  const account = await getOrCreateCreditAccount(session);
  const nextAccount = await updateCreditAccount({
    ...account,
    balance: Math.max(0, Number((account.balance + pnl).toFixed(2))),
    available: Math.max(0, Number((account.available + releasedMargin + pnl).toFixed(2))),
    updatedAt: new Date().toISOString(),
  });
  await writePaperPositions(session, nextPositions);
  const event = await recordPaperTradeEvent(paperTradeEvent(session, position, nextRemaining > 0 ? 'partial-close' : 'close', closeLots, exitPrice, releasedMargin, pnl));
  return { positions: nextPositions, creditAccount: nextAccount, position: nextPositions.find((item) => item.id === position.id), event };
}

async function liquidatePaperPositionsIfNeeded(session, knownPositions) {
  const positions = knownPositions ?? await getPaperPositions(session);
  const activePositions = positions.filter((position) => position.status !== 'closed' && (position.remainingLots ?? position.lots) > 0);
  const account = await getOrCreateCreditAccount(session);
  if (!activePositions.length) return { positions, creditAccount: account, liquidated: false };

  const marks = await Promise.all(activePositions.map(async (position) => {
    try {
      const quote = await getPaperMarketQuote(position.symbol);
      const exitPrice = position.side === 'long' ? quote.bid : quote.ask;
      const lots = Number(position.remainingLots ?? position.lots);
      const pnl = Number(((position.side === 'long' ? exitPrice - position.entryPrice : position.entryPrice - exitPrice) * position.contractSize * lots).toFixed(2));
      const releasedMargin = Number((position.margin * (lots / position.lots)).toFixed(2));
      return { position, exitPrice, lots, pnl, releasedMargin };
    } catch {
      return null;
    }
  }));
  if (marks.some((mark) => !mark)) return { positions, creditAccount: account, liquidated: false };

  const settledMarks = marks.filter(Boolean);
  const totalPnl = Number(settledMarks.reduce((sum, mark) => sum + mark.pnl, 0).toFixed(2));
  if (account.balance + totalPnl > 0.000001) return { positions, creditAccount: account, liquidated: false };

  const closedAt = new Date().toISOString();
  const byId = new Map(settledMarks.map((mark) => [mark.position.id, mark]));
  const nextPositions = positions.map((position) => {
    const mark = byId.get(position.id);
    if (!mark) return position;
    return {
      ...position,
      markPrice: mark.exitPrice,
      remainingLots: 0,
      closedLots: position.lots,
      status: 'closed',
      closedAt,
    };
  });
  const nextAccount = await updateCreditAccount({
    ...account,
    balance: 0,
    available: 0,
    updatedAt: closedAt,
  });
  await writePaperPositions(session, nextPositions);
  await Promise.all(settledMarks.map((mark) => recordPaperTradeEvent(
    paperTradeEvent(session, mark.position, 'liquidation', mark.lots, mark.exitPrice, mark.releasedMargin, mark.pnl),
  )));
  await createNotification(
    session.sub,
    'system',
    'Paper account liquidated',
    'Your paper-account equity reached 0 U. Open positions were closed at the latest server reference.',
    'critical',
    '/app/market',
  );
  return { positions: nextPositions, creditAccount: nextAccount, liquidated: true };
}

async function handlePaperTrading(req, res, requestUrl) {
  if (appSurface !== 'frontend') return sendJson(res, 404, { error: 'not found' });
  const session = requireSession(req, res);
  if (!session) return true;
  if (session.role === 'admin') return sendJson(res, 403, { error: 'administrators use the separate workspace' });
  const migratedPositions = await migratePaperMarginProfile(session);
  if (req.method === 'GET' && requestUrl.pathname === '/api/paper/positions') {
    const workspace = await liquidatePaperPositionsIfNeeded(session, migratedPositions);
    return sendJson(res, 200, workspace.positions);
  }
  if (req.method === 'POST' && requestUrl.pathname === '/api/paper/orders') {
    const input = await readBody(req);
    const symbol = String(input.symbol || '').trim().toUpperCase();
    const side = input.side === 'short' ? 'short' : input.side === 'long' ? 'long' : null;
    const spec = getPaperInstrumentSpec(symbol);
    const lots = Number(input.lots);
    // Leverage is a fixed paper-risk profile owned by the server. The browser
    // mirrors it only for its preview and cannot create oversized margins.
    const leverage = spec.defaultLeverage;
    if (!marketQuoteCatalogue[symbol] || !side || !Number.isFinite(lots) || lots < spec.minimumLots || lots > 1_000) return sendJson(res, 400, { error: 'invalid paper order' });
    let quote;
    try {
      quote = await getPaperMarketQuote(symbol);
    } catch (error) {
      return sendJson(res, 503, { error: error instanceof Error ? error.message : 'live paper quote unavailable' });
    }
    const normalizedLots = Number(lots.toFixed(2));
    const entryPrice = side === 'long' ? quote.ask : quote.bid;
    const notional = normalizedLots * spec.contractSize * entryPrice;
    const margin = Number((notional / leverage).toFixed(2));
    const account = await getOrCreateCreditAccount(session);
    if (account.available < margin) return sendJson(res, 409, { error: 'insufficient paper margin', creditAccount: account });
    const position = {
      id: randomUUID(), userId: session.sub, userName: session.name, symbol, side, lots: normalizedLots, contractSize: spec.contractSize, leverage,
      entryPrice, markPrice: entryPrice, notional, margin,
      stopLoss: Number.isFinite(Number(input.stopLoss)) && Number(input.stopLoss) > 0 ? Number(input.stopLoss) : undefined,
      takeProfit: Number.isFinite(Number(input.takeProfit)) && Number(input.takeProfit) > 0 ? Number(input.takeProfit) : undefined,
      openedAt: new Date().toISOString(), remainingLots: normalizedLots, closedLots: 0, status: 'open',
    };
    const positions = [position, ...(await getPaperPositions(session))];
    const creditAccount = await updateCreditAccount({ ...account, available: Number((account.available - margin).toFixed(2)), updatedAt: new Date().toISOString() });
    await writePaperPositions(session, positions);
    const event = await recordPaperTradeEvent(paperTradeEvent(session, position, 'open', normalizedLots, entryPrice, margin));
    return sendJson(res, 201, { position, positions, creditAccount, event });
  }
  if (req.method === 'POST' && requestUrl.pathname === '/api/paper/positions/close-all') {
    const positions = (await getPaperPositions(session)).filter((item) => item.status !== 'closed' && (item.remainingLots ?? item.lots) > 0);
    if (!positions.length) return sendJson(res, 200, { positions: [], creditAccount: await getOrCreateCreditAccount(session), closed: 0 });
    let latest;
    for (const position of positions) {
      latest = await closePaperPosition(session, position.id);
      if (latest?.error) return sendJson(res, latest.status || 400, latest);
    }
    return sendJson(res, 200, { ...latest, closed: positions.length });
  }
  const closeMatch = requestUrl.pathname.match(/^\/api\/paper\/positions\/([^/]+)\/close$/);
  if (req.method === 'POST' && closeMatch) {
    const input = await readBody(req);
    try {
      const result = await closePaperPosition(session, closeMatch[1], input.lots);
      return result.error ? sendJson(res, result.status || 400, result) : sendJson(res, 200, result);
    } catch (error) {
      return sendJson(res, 503, { error: error instanceof Error ? error.message : 'paper close unavailable' });
    }
  }
  const riskMatch = requestUrl.pathname.match(/^\/api\/paper\/positions\/([^/]+)\/risk$/);
  if (req.method === 'PUT' && riskMatch) {
    const input = await readBody(req);
    const positions = await getPaperPositions(session);
    const target = positions.find((item) => item.id === riskMatch[1] && item.status !== 'closed');
    if (!target) return sendJson(res, 404, { error: 'paper position not found' });
    const stopLoss = input.stopLoss === '' || input.stopLoss == null ? undefined : Number(input.stopLoss);
    const takeProfit = input.takeProfit === '' || input.takeProfit == null ? undefined : Number(input.takeProfit);
    if ((stopLoss !== undefined && (!Number.isFinite(stopLoss) || stopLoss <= 0)) || (takeProfit !== undefined && (!Number.isFinite(takeProfit) || takeProfit <= 0))) return sendJson(res, 400, { error: 'invalid paper risk settings' });
    const nextPositions = positions.map((item) => item.id === target.id ? { ...item, stopLoss, takeProfit } : item);
    await writePaperPositions(session, nextPositions);
    const event = await recordPaperTradeEvent(paperTradeEvent(session, target, 'risk-update', Number(target.remainingLots ?? target.lots), target.markPrice, 0));
    return sendJson(res, 200, { positions: nextPositions, creditAccount: await getOrCreateCreditAccount(session), position: nextPositions.find((item) => item.id === target.id), event });
  }
  return sendJson(res, 404, { error: 'paper route not found' });
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
    const reason = String(input.reason || '').trim().slice(0, 240) || 'Paper margin allocation request';
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
  if (req.method === 'POST' && (requestUrl.pathname === '/api/credits/reserve' || requestUrl.pathname === '/api/credits/settle')) {
    // Margin reservation and settlement are deliberately not browser-writeable.
    // A paper order must pass through /api/paper so the server owns the quote,
    // contract, position state and resulting account movement.
    return sendJson(res, 410, { error: 'paper margin operations are server managed' });
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
    if (!targetId || !Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1_000_000) return sendJson(res, 400, { error: 'invalid U adjustment' });
    const target = await findAccountById(targetId);
    if (!target) return sendJson(res, 404, { error: 'account not found' });
    const account = await getOrCreateCreditAccount({ sub: target.id, name: target.name, email: target.email });
    if (amount < 0 && Math.abs(amount) > account.available) return sendJson(res, 409, { error: 'U reduction exceeds available balance', account });
    const updated = await updateCreditAccount({
      ...account,
      userName: target.name,
      email: target.email,
      balance: Number((account.balance + amount).toFixed(2)),
      available: Number((account.available + amount).toFixed(2)),
      grantedTotal: Number((account.grantedTotal + Math.max(amount, 0)).toFixed(2)),
      updatedAt: new Date().toISOString(),
    });
    const direction = amount > 0 ? 'allocated' : 'removed';
    await createNotification(target.id, 'fund', 'U balance updated', `${Math.abs(amount)} U has been ${direction} from your paper account.`, amount > 0 ? 'success' : 'warning', '/app/dashboard');
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
    await createNotification(target.userId, 'fund', 'U request approved', `Your ${target.amount} U paper-margin request has been approved.`, 'success', '/app/dashboard');
    return sendJson(res, 200, { ...target, status: 'approved', reviewedAt, reviewer: session.name });
  }
  if (req.method === 'POST' && requestUrl.pathname === '/api/admin/credits/reject') {
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
    // A rejected request releases only its pending hold. It never changes the
    // spendable balance, which keeps review outcomes separate from allocation.
    await updateCreditAccount({ ...account, pending: Math.max(0, account.pending - target.amount), updatedAt: new Date().toISOString() });
    const reviewedAt = new Date().toISOString();
    if (pool) {
      await pool.query('UPDATE ad88_credit_requests SET status=$2, reviewed_at=$3, reviewer=$4 WHERE id=$1', [id, 'rejected', reviewedAt, session.name]);
    } else {
      memoryCreditRequests.set(id, { ...target, status: 'rejected', reviewedAt, reviewer: session.name });
    }
    await createNotification(target.userId, 'fund', 'U request declined', `Your ${target.amount} U paper-margin request was declined.`, 'warning', '/app/dashboard');
    return sendJson(res, 200, { ...target, status: 'rejected', reviewedAt, reviewer: session.name });
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
    // Paper positions are now server-issued records.  Do not let a browser
    // replace the ledger with a handcrafted snapshot.
    if (key === 'paperPositions') return sendJson(res, 403, { error: 'paper positions are managed by the paper-trading service' });
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

function kualaLumpurMidnightMs(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  // Kuala Lumpur is UTC+08:00 year-round. The cutoff is the start of the
  // current local day, so messages sent today remain available until the next
  // local midnight.
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)) - 8 * 60 * 60 * 1000;
}

async function pruneSupportMessages() {
  const cutoff = kualaLumpurMidnightMs();
  if (pool) {
    await pool.query('DELETE FROM ad88_support_messages WHERE created_at < to_timestamp($1 / 1000.0)', [cutoff]);
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

function normalizeTimedScenario(row, includePrivateAdminFields = false) {
  const status = row.status || 'active';
  const note = String(row.adminNote ?? row.admin_note ?? '').trim();
  const exposeNote = includePrivateAdminFields || status === 'settled';
  return {
    id: row.id,
    userId: row.userId ?? row.user_id,
    userName: row.userName ?? row.user_name,
    userEmail: row.userEmail ?? row.user_email,
    symbol: String(row.symbol || '').toUpperCase(),
    direction: row.direction === 'down' ? 'down' : 'up',
    observationPoints: Number(row.observationPoints ?? row.observation_points ?? 0),
    durationSeconds: Number(row.durationSeconds ?? row.duration_seconds ?? 0),
    referencePrice: Number(row.referencePrice ?? row.reference_price ?? 0),
    expiresAt: row.expiresAt ?? row.expires_at,
    status,
    result: row.result ?? undefined,
    settlementPrice: row.settlementPrice == null && row.settlement_price == null ? undefined : Number(row.settlementPrice ?? row.settlement_price),
    settledAt: row.settledAt ?? row.settled_at ?? undefined,
    adminNote: exposeNote && note ? note : undefined,
    adminNoteUpdatedAt: includePrivateAdminFields ? row.adminNoteUpdatedAt ?? row.admin_note_updated_at ?? undefined : undefined,
    adminNoteUpdatedBy: includePrivateAdminFields ? row.adminNoteUpdatedBy ?? row.admin_note_updated_by ?? undefined : undefined,
    voidedAt: row.voidedAt ?? row.voided_at ?? undefined,
    voidedBy: row.voidedBy ?? row.voided_by ?? undefined,
    voidReason: row.voidReason ?? row.void_reason ?? undefined,
    createdAt: row.createdAt ?? row.created_at,
  };
}

let timedScenarioSettlementInFlight = false;

async function settleDueTimedScenarios() {
  if (timedScenarioSettlementInFlight) return;
  timedScenarioSettlementInFlight = true;
  try {
    const now = Date.now();
    const due = pool
      ? (await pool.query("SELECT * FROM ad88_timed_scenarios WHERE status = 'active' AND expires_at <= NOW() ORDER BY expires_at ASC LIMIT 100")).rows
      : [...memoryTimedScenarios.values()].filter((item) => item.status === 'active' && new Date(item.expiresAt).getTime() <= now);
    if (!due.length) return;
    for (const row of due) {
      const scenario = normalizeTimedScenario(row);
      let quote;
      try {
        quote = await getPaperMarketQuote(scenario.symbol);
      } catch {
        // Keep the observation active when a verified quote is unavailable. It
        // must never be resolved from a fabricated fallback value.
        continue;
      }
      const settlementPrice = Number(quote.price ?? ((quote.bid + quote.ask) / 2));
      const tolerance = Math.max(Math.abs(scenario.referencePrice) * 0.000001, 0.00000001);
      const result = Math.abs(settlementPrice - scenario.referencePrice) <= tolerance
        ? 'flat'
        : ((scenario.direction === 'up' && settlementPrice > scenario.referencePrice) || (scenario.direction === 'down' && settlementPrice < scenario.referencePrice) ? 'confirmed' : 'not-confirmed');
      const settledAt = new Date().toISOString();
      if (pool) {
        await pool.query('UPDATE ad88_timed_scenarios SET status=$2, result=$3, settlement_price=$4, settled_at=$5 WHERE id=$1 AND status=$6', [scenario.id, 'settled', result, settlementPrice, settledAt, 'active']);
      } else {
        const current = memoryTimedScenarios.get(scenario.id);
        if (current?.status === 'active') memoryTimedScenarios.set(scenario.id, { ...current, status: 'settled', result, settlementPrice, settledAt });
      }
      await createNotification(scenario.userId, 'market', 'Market observation complete', `${scenario.symbol} observation completed: ${result}.`, result === 'confirmed' ? 'success' : result === 'flat' ? 'info' : 'warning', '/app/market');
    }
  } finally {
    timedScenarioSettlementInFlight = false;
  }
}

async function listTimedScenarios(session, admin = false) {
  await settleDueTimedScenarios();
  if (pool) {
    const result = admin
      ? await pool.query('SELECT * FROM ad88_timed_scenarios ORDER BY created_at DESC LIMIT 500')
      : await pool.query('SELECT * FROM ad88_timed_scenarios WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [session.sub]);
    return result.rows.map((row) => normalizeTimedScenario(row, admin));
  }
  return [...memoryTimedScenarios.values()]
    .filter((item) => admin || item.userId === session.sub)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((item) => normalizeTimedScenario(item, admin));
}

async function createTimedScenario(session, input) {
  const symbol = String(input.symbol || '').trim().toUpperCase();
  const direction = input.direction === 'down' ? 'down' : input.direction === 'up' ? 'up' : null;
  const observationPoints = Number(input.observationPoints);
  const durationSeconds = Number(input.durationSeconds);
  if (!marketQuoteCatalogue[symbol] || !direction || !Number.isFinite(observationPoints) || observationPoints < 10 || observationPoints > 1_000_000 || !Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 7 * 24 * 60 * 60) return { error: 'invalid market observation', status: 400 };
  let quote;
  try { quote = await getPaperMarketQuote(symbol); } catch (error) { return { error: error instanceof Error ? error.message : 'verified quote unavailable', status: 503 }; }
  const createdAt = new Date().toISOString();
  const scenario = {
    id: randomUUID(), userId: session.sub, userName: session.name, userEmail: session.email,
    symbol, direction, observationPoints: Math.round(observationPoints), durationSeconds,
    referencePrice: Number(quote.price ?? ((quote.bid + quote.ask) / 2)),
    expiresAt: new Date(Date.now() + durationSeconds * 1000).toISOString(), status: 'active', createdAt,
  };
  if (pool) {
    await pool.query('INSERT INTO ad88_timed_scenarios (id,user_id,user_name,user_email,symbol,direction,observation_points,duration_seconds,reference_price,expires_at,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [scenario.id, scenario.userId, scenario.userName, scenario.userEmail, scenario.symbol, scenario.direction, scenario.observationPoints, scenario.durationSeconds, scenario.referencePrice, scenario.expiresAt, scenario.status, scenario.createdAt]);
  } else {
    memoryTimedScenarios.set(scenario.id, scenario);
  }
  return { scenario: normalizeTimedScenario(scenario) };
}

async function voidTimedScenario(session, id, reason) {
  const cleanReason = String(reason || '').trim().slice(0, 240);
  if (!cleanReason) return { error: 'void reason is required', status: 400 };
  if (pool) {
    const existing = await pool.query("SELECT * FROM ad88_timed_scenarios WHERE id=$1 AND status='active' LIMIT 1", [id]);
    if (!existing.rowCount) return { error: 'active observation not found', status: 404 };
    const voidedAt = new Date().toISOString();
    const result = await pool.query("UPDATE ad88_timed_scenarios SET status='void', voided_at=$2, voided_by=$3, void_reason=$4 WHERE id=$1 AND status='active' RETURNING *", [id, voidedAt, session.email || session.name, cleanReason]);
    return { scenario: normalizeTimedScenario(result.rows[0], true) };
  }
  const current = memoryTimedScenarios.get(id);
  if (!current || current.status !== 'active') return { error: 'active observation not found', status: 404 };
  const next = { ...current, status: 'void', voidedAt: new Date().toISOString(), voidedBy: session.email || session.name, voidReason: cleanReason };
  memoryTimedScenarios.set(id, next);
  return { scenario: normalizeTimedScenario(next, true) };
}

async function updateTimedScenarioNote(session, id, note) {
  const cleanNote = String(note ?? '').trim().slice(0, 600);
  const updatedAt = new Date().toISOString();
  const updatedBy = String(session.email || session.name || 'VENTURE FUNDS Admin').slice(0, 240);
  if (pool) {
    const result = await pool.query(
      'UPDATE ad88_timed_scenarios SET admin_note=$2, admin_note_updated_at=$3, admin_note_updated_by=$4 WHERE id=$1 RETURNING *',
      [id, cleanNote, updatedAt, updatedBy],
    );
    if (!result.rowCount) return { error: 'market observation not found', status: 404 };
    return { scenario: normalizeTimedScenario(result.rows[0], true) };
  }
  const current = memoryTimedScenarios.get(id);
  if (!current) return { error: 'market observation not found', status: 404 };
  const next = { ...current, adminNote: cleanNote, adminNoteUpdatedAt: updatedAt, adminNoteUpdatedBy: updatedBy };
  memoryTimedScenarios.set(id, next);
  return { scenario: normalizeTimedScenario(next, true) };
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
  if (!/^[A-Z0-9]{1,16}$/.test(symbol) || !['long', 'short'].includes(side) || !['open', 'close', 'partial-close', 'risk-update', 'liquidation'].includes(action)) return { error: 'invalid trade event' };
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

async function handleTimedScenarios(req, res, requestUrl) {
  if (appSurface !== 'frontend') return sendJson(res, 404, { error: 'not found' });
  const session = requireSession(req, res);
  if (!session) return true;
  if (session.role === 'admin') return sendJson(res, 403, { error: 'administrators use the separate workspace' });
  if (req.method === 'GET' && requestUrl.pathname === '/api/market-scenarios') return sendJson(res, 200, await listTimedScenarios(session));
  if (req.method === 'POST' && requestUrl.pathname === '/api/market-scenarios') {
    const result = await createTimedScenario(session, await readBody(req));
    return result.error ? sendJson(res, result.status || 400, result) : sendJson(res, 201, result.scenario);
  }
  return sendJson(res, 404, { error: 'market observation route not found' });
}

async function handleAdminTimedScenarios(req, res, requestUrl) {
  const session = requireSession(req, res, 'admin');
  if (!session) return true;
  if (req.method === 'GET' && requestUrl.pathname === '/api/admin/market-scenarios') return sendJson(res, 200, await listTimedScenarios(session, true));
  const noteMatch = requestUrl.pathname.match(/^\/api\/admin\/market-scenarios\/([^/]+)\/note$/);
  if ((req.method === 'POST' || req.method === 'PATCH') && noteMatch) {
    const result = await updateTimedScenarioNote(session, decodeURIComponent(noteMatch[1]), (await readBody(req)).note);
    return result.error ? sendJson(res, result.status || 400, result) : sendJson(res, 200, result.scenario);
  }
  const voidMatch = requestUrl.pathname.match(/^\/api\/admin\/market-scenarios\/([^/]+)\/void$/);
  if (req.method === 'POST' && voidMatch) {
    const input = await readBody(req);
    const result = await voidTimedScenario(session, decodeURIComponent(voidMatch[1]), input.reason);
    if (!result.error) {
      await createNotification(result.scenario.userId, 'system', 'Market observation voided', `${result.scenario.symbol} observation was voided for review: ${result.scenario.voidReason}.`, 'warning', '/app/market');
    }
    return result.error ? sendJson(res, result.status || 400, result) : sendJson(res, 200, result.scenario);
  }
  return sendJson(res, 404, { error: 'admin market observation route not found' });
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
  return memoryLedgerEntries
    .filter((item) => all || item.userId === session.sub)
    .slice()
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 500)
    .map(normalizeLedgerEntry);
}

async function handleLedger(req, res, requestUrl) {
  const session = requireSession(req, res);
  if (!session) return true;
  const deleteMatch = requestUrl.pathname.match(/^\/api\/ledger\/([^/]+)$/);
  if (req.method === 'DELETE' && deleteMatch) {
    if (session.role !== 'admin') return sendJson(res, 403, { error: 'administrator access required' });
    const id = decodeURIComponent(deleteMatch[1]);
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const existing = await client.query('SELECT id FROM ad88_ledger_entries WHERE id = $1 FOR UPDATE', [id]);
        if (!existing.rowCount) {
          await client.query('ROLLBACK');
          return sendJson(res, 404, { error: 'ledger entry not found' });
        }
        // Keep the funding request and its review outcome intact. Only detach
        // the optional visual ledger link before removing the ledger row.
        await client.query('UPDATE ad88_funding_requests SET ledger_entry_id = NULL WHERE ledger_entry_id = $1', [id]);
        await client.query('DELETE FROM ad88_ledger_entries WHERE id = $1', [id]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      return sendJson(res, 200, { ok: true, id });
    }
    const index = memoryLedgerEntries.findIndex((entry) => entry.id === id);
    if (index < 0) return sendJson(res, 404, { error: 'ledger entry not found' });
    memoryLedgerEntries.splice(index, 1);
    for (const [requestId, request] of memoryFundingRequests.entries()) {
      if (request.ledgerEntryId === id) memoryFundingRequests.set(requestId, { ...request, ledgerEntryId: undefined });
    }
    return sendJson(res, 200, { ok: true, id });
  }
  if (req.method !== 'GET' || requestUrl.pathname !== '/api/ledger') return sendJson(res, 404, { error: 'ledger route not found' });
  const all = session.role === 'admin' && requestUrl.searchParams.get('scope') === 'all';
  return sendJson(res, 200, await listLedgerEntries(session, all));
}

function roundFundingAmount(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function buildFundingRate(baseRate, source, cacheState = 'fresh') {
  const normalizedBase = roundFundingAmount(baseRate, 4);
  return {
    baseRate: normalizedBase,
    depositRate: roundFundingAmount(normalizedBase + 0.03, 4),
    withdrawalRate: roundFundingAmount(Math.max(0.01, normalizedBase - 0.03), 4),
    source,
    updatedAt: new Date().toISOString(),
    cacheState,
  };
}

async function getFundingRate() {
  if (fundingRateCache.value && fundingRateCache.expiresAt > Date.now()) return fundingRateCache.value;
  if (fundingRateRequest) return fundingRateRequest;
  fundingRateRequest = (async () => {
    try {
      // This is a public daily FX reference, not a payment-processor quote.
      const response = await fetch('https://api.frankfurter.app/latest?from=USD&to=MYR', {
        headers: { accept: 'application/json', 'user-agent': 'venture-funds-paper-funding/1.0' },
        signal: AbortSignal.timeout(4_500),
      });
      if (!response.ok) throw new Error(`daily FX reference returned ${response.status}`);
      const payload = await response.json();
      const baseRate = Number(payload?.rates?.MYR);
      if (!Number.isFinite(baseRate) || baseRate <= 0) throw new Error('daily FX reference did not include MYR');
      const value = buildFundingRate(baseRate, 'Daily MYR reference', 'fresh');
      fundingRateCache = { expiresAt: Date.now() + fundingRateTtlMs, value };
      return value;
    } catch {
      const prior = fundingRateCache.value;
      const value = prior
        ? { ...prior, cacheState: 'fallback' }
        : buildFundingRate(4.1, 'VENTURE FUNDS daily-reference fallback', 'fallback');
      // A short fallback cache avoids retrying an unavailable public endpoint
      // on every client request while still retrying long before the next day.
      fundingRateCache = { expiresAt: Date.now() + 15 * 60 * 1000, value };
      return value;
    } finally {
      fundingRateRequest = null;
    }
  })();
  return fundingRateRequest;
}

function sanitizeFundingText(value, limit = 80) {
  return String(value || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function encryptFundingValue(value) {
  const plainText = String(value || '').trim();
  if (!plainText || plainText.startsWith('v1.')) return plainText || undefined;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', fundingDataEncryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

function decryptFundingValue(value) {
  const stored = String(value || '').trim();
  if (!stored) return '';
  if (!stored.startsWith('v1.')) return stored;
  const [, ivPart, tagPart, ciphertextPart] = stored.split('.');
  if (!ivPart || !tagPart || !ciphertextPart) return '';
  try {
    const decipher = createDecipheriv('aes-256-gcm', fundingDataEncryptionKey, Buffer.from(ivPart, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextPart, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function maskFundingAccountReference(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return undefined;
  return `•••• ${digits.slice(-4)}`;
}

function normalizeFundingRequest(row, { includeSensitive = false } = {}) {
  const accountHolder = decryptFundingValue(row.accountHolder ?? row.account_holder);
  const accountReference = decryptFundingValue(row.accountReference ?? row.account_reference);
  return {
    id: row.id,
    userId: row.userId ?? row.user_id,
    userName: row.userName ?? row.user_name,
    email: row.email,
    kind: row.kind,
    method: row.method,
    bankName: row.bankName ?? row.bank_name ?? undefined,
    // A complete account holder/name and number are supplied only to an
    // authenticated administrator review. Client history remains masked.
    accountHolder: includeSensitive ? accountHolder || undefined : undefined,
    accountReference: includeSensitive ? accountReference || undefined : maskFundingAccountReference(accountReference),
    amountMyr: Number(row.amountMyr ?? row.amount_myr ?? 0),
    amountU: Number(row.amountU ?? row.amount_u ?? 0),
    rate: Number(row.rate ?? 0),
    baseRate: Number(row.baseRate ?? row.base_rate ?? 0),
    rateSource: row.rateSource ?? row.rate_source ?? 'VENTURE FUNDS daily reference',
    rateUpdatedAt: row.rateUpdatedAt ?? row.rate_updated_at,
    status: row.status,
    createdAt: row.createdAt ?? row.created_at,
    customerNote: sanitizeFundingText(row.customerNote ?? row.customer_note, 320) || undefined,
    reviewedAt: row.reviewedAt ?? row.reviewed_at ?? undefined,
    reviewer: row.reviewer ?? undefined,
    reviewerNote: row.reviewerNote ?? row.reviewer_note ?? undefined,
    supportRequired: Boolean(row.supportRequired ?? row.support_required),
    ledgerEntryId: row.ledgerEntryId ?? row.ledger_entry_id ?? undefined,
  };
}

async function findFundingRequest(id) {
  if (pool) {
    const result = await pool.query('SELECT * FROM ad88_funding_requests WHERE id = $1 LIMIT 1', [id]);
    return result.rows[0] ? normalizeFundingRequest(result.rows[0], { includeSensitive: true }) : null;
  }
  const request = memoryFundingRequests.get(id);
  return request ? normalizeFundingRequest(request, { includeSensitive: true }) : null;
}

async function listFundingRequests(session, admin = false) {
  if (pool) {
    const result = admin
      ? await pool.query('SELECT * FROM ad88_funding_requests ORDER BY created_at DESC LIMIT 500')
      : await pool.query('SELECT * FROM ad88_funding_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [session.sub]);
    return result.rows.map((row) => normalizeFundingRequest(row, { includeSensitive: admin }));
  }
  return [...memoryFundingRequests.values()]
    .filter((item) => admin || item.userId === session.sub)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, admin ? 500 : 100)
    .map((row) => normalizeFundingRequest(row, { includeSensitive: admin }));
}

async function saveFundingRequest(request) {
  const storedRequest = {
    ...request,
    accountHolder: encryptFundingValue(request.accountHolder),
    accountReference: encryptFundingValue(request.accountReference),
  };
  if (pool) {
    await pool.query(
      `INSERT INTO ad88_funding_requests (
         id,user_id,user_name,email,kind,method,bank_name,account_holder,account_reference,
         amount_myr,amount_u,rate,base_rate,rate_source,rate_updated_at,status,created_at,customer_note,
         reviewed_at,reviewer,reviewer_note,support_required,ledger_entry_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
      [
        storedRequest.id, storedRequest.userId, storedRequest.userName, storedRequest.email, storedRequest.kind, storedRequest.method,
        storedRequest.bankName ?? null, storedRequest.accountHolder ?? null, storedRequest.accountReference ?? null,
        storedRequest.amountMyr, storedRequest.amountU, storedRequest.rate, storedRequest.baseRate, storedRequest.rateSource,
        storedRequest.rateUpdatedAt, storedRequest.status, storedRequest.createdAt, storedRequest.customerNote ?? '', storedRequest.reviewedAt ?? null,
        storedRequest.reviewer ?? null, storedRequest.reviewerNote ?? null, Boolean(storedRequest.supportRequired), storedRequest.ledgerEntryId ?? null,
      ],
    );
  } else {
    memoryFundingRequests.set(storedRequest.id, storedRequest);
  }
  return normalizeFundingRequest(storedRequest);
}

async function updateFundingRequest(id, fields) {
  const current = await findFundingRequest(id);
  if (!current) return null;
  const next = { ...current, ...fields };
  if (pool) {
    await pool.query(
      `UPDATE ad88_funding_requests SET
        status=$2, customer_note=$3, reviewed_at=$4, reviewer=$5, reviewer_note=$6, ledger_entry_id=$7
       WHERE id=$1`,
      [next.id, next.status, next.customerNote ?? '', next.reviewedAt ?? null, next.reviewer ?? null, next.reviewerNote ?? null, next.ledgerEntryId ?? null],
    );
  } else {
    memoryFundingRequests.set(next.id, {
      ...next,
      accountHolder: encryptFundingValue(next.accountHolder),
      accountReference: encryptFundingValue(next.accountReference),
    });
  }
  return normalizeFundingRequest(next);
}

async function deleteCompletedFundingRequest(id) {
  const request = await findFundingRequest(id);
  if (!request) return { error: 'funding request not found', status: 404 };
  if (request.status === 'pending') return { error: 'pending funding requests cannot be deleted', status: 409 };
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM ad88_funding_requests WHERE id = $1 AND status <> $2', [id, 'pending']);
      if (request.ledgerEntryId) await client.query('DELETE FROM ad88_ledger_entries WHERE id = $1', [request.ledgerEntryId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } else {
    memoryFundingRequests.delete(id);
    if (request.ledgerEntryId) {
      const ledgerIndex = memoryLedgerEntries.findIndex((entry) => entry.id === request.ledgerEntryId);
      if (ledgerIndex >= 0) memoryLedgerEntries.splice(ledgerIndex, 1);
    }
  }
  return { deleted: true };
}

async function clearCompletedFundingHistory(kind) {
  const normalizedKind = kind === 'deposit' || kind === 'withdraw' ? kind : undefined;
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        'DELETE FROM ad88_funding_requests WHERE status <> $1 AND ($2::text IS NULL OR kind = $2) RETURNING ledger_entry_id',
        ['pending', normalizedKind ?? null],
      );
      const ledgerIds = result.rows.map((row) => row.ledger_entry_id).filter(Boolean);
      if (ledgerIds.length) await client.query('DELETE FROM ad88_ledger_entries WHERE id = ANY($1::text[])', [ledgerIds]);
      await client.query('COMMIT');
      return { deleted: result.rowCount || 0 };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  const completed = [...memoryFundingRequests.values()]
    .map((item) => normalizeFundingRequest(item, { includeSensitive: true }))
    .filter((item) => item.status !== 'pending' && (!normalizedKind || item.kind === normalizedKind));
  const ledgerIds = new Set(completed.map((item) => item.ledgerEntryId).filter(Boolean));
  completed.forEach((item) => memoryFundingRequests.delete(item.id));
  for (let index = memoryLedgerEntries.length - 1; index >= 0; index -= 1) {
    if (ledgerIds.has(memoryLedgerEntries[index].id)) memoryLedgerEntries.splice(index, 1);
  }
  return { deleted: completed.length };
}

function fundingMethodLabel(request) {
  return request.method === 'tng' ? 'TNG eWallet' : request.bankName || 'Bank support';
}

function fundingLedgerNote(request) {
  const action = request.kind === 'deposit' ? 'paper deposit review' : 'paper withdrawal review';
  return `${fundingMethodLabel(request)} · ${action} · MYR ${request.amountMyr.toFixed(2)} @ MYR ${request.rate.toFixed(4)}/U`;
}

async function createFundingLedgerEntry(request) {
  const entry = {
    id: randomUUID(),
    userId: request.userId,
    type: request.kind,
    amount: request.amountU,
    currency: 'U',
    status: 'pending',
    time: request.createdAt,
    note: fundingLedgerNote(request),
    refId: `FND-${request.id.slice(0, 8).toUpperCase()}`,
    direction: request.kind === 'deposit' ? 'in' : 'out',
  };
  if (pool) {
    await pool.query(
      'INSERT INTO ad88_ledger_entries (id,user_id,type,amount,currency,status,time,note,ref_id,direction) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [entry.id, entry.userId, entry.type, entry.amount, entry.currency, entry.status, entry.time, entry.note, entry.refId, entry.direction],
    );
  } else {
    memoryLedgerEntries.push(entry);
  }
  return entry;
}

async function updateFundingLedgerEntry(entryId, status, note) {
  if (!entryId) return;
  if (pool) {
    await pool.query('UPDATE ad88_ledger_entries SET status=$2, note=$3 WHERE id=$1', [entryId, status, note]);
    return;
  }
  const index = memoryLedgerEntries.findIndex((entry) => entry.id === entryId);
  if (index >= 0) memoryLedgerEntries[index] = { ...memoryLedgerEntries[index], status, note };
}

async function createPaperFundingRequest(session, input) {
  const kind = input.kind === 'withdraw' ? 'withdraw' : input.kind === 'deposit' ? 'deposit' : null;
  const method = input.method === 'bank' ? 'bank' : input.method === 'tng' ? 'tng' : null;
  if (!kind || !method) return { error: 'invalid funding request', status: 400 };

  const bankName = method === 'bank' ? sanitizeFundingText(input.bankName, 60) : undefined;
  if (method === 'bank' && !fundingBankOptions.has(bankName)) return { error: 'invalid bank method', status: 400 };
  const accountHolder = sanitizeFundingText(input.accountHolder, 80) || undefined;
  const accountReference = String(input.accountReference || '').replace(/\D/g, '').slice(0, 24) || undefined;
  const customerNote = sanitizeFundingText(input.customerNote, 320) || undefined;
  if (kind === 'withdraw' && (!accountHolder || accountHolder.length < 2)) return { error: 'a full account holder name is required for withdrawal review', status: 400 };
  if (kind === 'withdraw' && (!accountReference || accountReference.length < 7)) return { error: 'a complete account number is required for withdrawal review', status: 400 };
  const rateSnapshot = await getFundingRate();
  const rate = kind === 'deposit' ? rateSnapshot.depositRate : rateSnapshot.withdrawalRate;
  const rawAmount = kind === 'deposit' ? Number(input.amountMyr) : Number(input.amountU);
  if (!Number.isFinite(rawAmount) || rawAmount <= 0 || rawAmount > 1_000_000) return { error: 'invalid funding amount', status: 400 };
  const amountMyr = kind === 'deposit'
    ? roundFundingAmount(rawAmount, 2)
    : roundFundingAmount(rawAmount * rate, 2);
  const amountU = kind === 'deposit'
    ? roundFundingAmount(rawAmount / rate, 4)
    : roundFundingAmount(rawAmount, 4);
  if (kind === 'deposit' && amountMyr < 100) return { error: 'minimum deposit is MYR 100', status: 400 };
  if (kind === 'withdraw' && amountU < 25) return { error: 'minimum withdrawal is 25 U', status: 400 };

  let withdrawalReserved = false;
  let account;
  if (kind === 'withdraw') {
    account = await getOrCreateCreditAccount(session);
    if (account.available + 0.000001 < amountU) return { error: 'insufficient available U for withdrawal review', status: 409, creditAccount: account };
    await updateCreditAccount({
      ...account,
      available: roundFundingAmount(account.available - amountU, 2),
      pending: roundFundingAmount(account.pending + amountU, 2),
      updatedAt: new Date().toISOString(),
    });
    withdrawalReserved = true;
  }

  const request = {
    id: randomUUID(),
    userId: session.sub,
    userName: session.name,
    email: session.email,
    kind,
    method,
    bankName,
    accountHolder,
    accountReference,
    amountMyr,
    amountU,
    rate,
    baseRate: rateSnapshot.baseRate,
    rateSource: rateSnapshot.source,
    rateUpdatedAt: rateSnapshot.updatedAt,
    status: 'pending',
    createdAt: new Date().toISOString(),
    customerNote,
    supportRequired: method === 'bank' || Boolean(input.supportRequired),
  };
  try {
    await saveFundingRequest(request);
    const ledgerEntry = await createFundingLedgerEntry(request);
    const saved = await updateFundingRequest(request.id, { ledgerEntryId: ledgerEntry.id });
    return { request: saved ?? { ...request, ledgerEntryId: ledgerEntry.id } };
  } catch (error) {
    if (withdrawalReserved && account) {
      await updateCreditAccount({
        ...account,
        updatedAt: new Date().toISOString(),
      }).catch(() => undefined);
    }
    throw error;
  }
}

async function reviewPaperFundingRequest(session, id, approved, reviewerNote) {
  const request = await findFundingRequest(id);
  if (!request || request.status !== 'pending') return { error: 'funding request not found', status: 404 };
  const reviewNote = sanitizeFundingText(reviewerNote, 320);
  const reviewedAt = new Date().toISOString();
  const account = await getOrCreateCreditAccount({ sub: request.userId, name: request.userName, email: request.email });
  if (approved && request.kind === 'withdraw' && account.balance + 0.000001 < request.amountU) {
    return { error: 'paper balance changed before the withdrawal could be approved', status: 409 };
  }
  if (approved && request.kind === 'deposit') {
    await updateCreditAccount({
      ...account,
      balance: roundFundingAmount(account.balance + request.amountU, 2),
      available: roundFundingAmount(account.available + request.amountU, 2),
      grantedTotal: roundFundingAmount(account.grantedTotal + request.amountU, 2),
      updatedAt: reviewedAt,
    });
  }
  if (request.kind === 'withdraw') {
    await updateCreditAccount({
      ...account,
      balance: approved ? roundFundingAmount(account.balance - request.amountU, 2) : account.balance,
      available: approved ? account.available : roundFundingAmount(account.available + request.amountU, 2),
      pending: roundFundingAmount(Math.max(0, account.pending - request.amountU), 2),
      updatedAt: reviewedAt,
    });
  }
  const nextStatus = approved ? 'approved' : 'rejected';
  const reviewed = await updateFundingRequest(request.id, {
    status: nextStatus,
    reviewedAt,
    reviewer: session.name || session.email,
    reviewerNote: reviewNote || undefined,
  });
  const suffix = approved ? 'review approved' : 'review rejected';
  await updateFundingLedgerEntry(request.ledgerEntryId, nextStatus, `${fundingLedgerNote(request)} · ${suffix}`);
  const action = request.kind === 'deposit' ? 'Deposit' : 'Withdrawal';
  await createNotification(
    request.userId,
    'fund',
    `${action} review ${approved ? 'approved' : 'rejected'}`,
    `${request.amountU.toFixed(2)} U · MYR ${request.amountMyr.toFixed(2)} · ${fundingMethodLabel(request)}.`,
    approved ? 'success' : 'warning',
    '/app/funding',
  );
  return { request: reviewed };
}

async function handleFunding(req, res, requestUrl) {
  if (appSurface !== 'frontend') return sendJson(res, 404, { error: 'not found' });
  const session = requireSession(req, res);
  if (!session) return true;
  if (session.role === 'admin') return sendJson(res, 403, { error: 'administrators use the separate workspace' });
  if (req.method === 'GET' && requestUrl.pathname === '/api/funding/rate') return sendJson(res, 200, await getFundingRate());
  if (req.method === 'GET' && requestUrl.pathname === '/api/funding/requests') return sendJson(res, 200, await listFundingRequests(session));
  if (req.method === 'POST' && requestUrl.pathname === '/api/funding/requests') {
    const result = await createPaperFundingRequest(session, await readBody(req));
    return result.error ? sendJson(res, result.status || 400, result) : sendJson(res, 201, result.request);
  }
  return sendJson(res, 404, { error: 'funding route not found' });
}

async function handleAdminFunding(req, res, requestUrl) {
  const session = requireSession(req, res, 'admin');
  if (!session) return true;
  if (req.method === 'GET' && requestUrl.pathname === '/api/admin/funding/requests') return sendJson(res, 200, await listFundingRequests(session, true));
  if (req.method === 'DELETE' && requestUrl.pathname === '/api/admin/funding/requests/history') {
    const requestedKind = requestUrl.searchParams.get('kind');
    if (requestedKind && requestedKind !== 'deposit' && requestedKind !== 'withdraw') return sendJson(res, 400, { error: 'invalid funding history type' });
    return sendJson(res, 200, await clearCompletedFundingHistory(requestedKind));
  }
  const match = requestUrl.pathname.match(/^\/api\/admin\/funding\/requests\/([^/]+)\/(approve|reject)$/);
  if (req.method === 'POST' && match) {
    const input = await readBody(req);
    const result = await reviewPaperFundingRequest(session, match[1], match[2] === 'approve', input.reviewerNote);
    return result.error ? sendJson(res, result.status || 400, result) : sendJson(res, 200, result.request);
  }
  const deleteMatch = requestUrl.pathname.match(/^\/api\/admin\/funding\/requests\/([^/]+)$/);
  if (req.method === 'DELETE' && deleteMatch) {
    const result = await deleteCompletedFundingRequest(deleteMatch[1]);
    return result.error ? sendJson(res, result.status || 400, result) : sendJson(res, 200, result);
  }
  return sendJson(res, 404, { error: 'admin funding route not found' });
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
    if (session.role === 'admin') await createNotification(userId, 'task', 'New support reply', 'Client Support has replied to your conversation.', 'info', '/app/support');
    return sendJson(res, 201, message);
  }
  return sendJson(res, 404, { error: 'support route not found' });
}

const twelveDataSymbols = {
  // Twelve Data symbols are kept as a server-side adapter map. The public
  // market snapshot remains the first quote path, while these mappings give
  // the selected chart a real time-series provider when the account plan
  // supports the instrument.
  'GC=F': 'XAU/USD', 'SI=F': 'XAG/USD', 'CL=F': 'WTI/USD', 'BZ=F': 'BRENT/USD', 'NG=F': 'NATGAS/USD', 'HG=F': 'COPPER/USD',
  'PL=F': 'XPT/USD', 'PA=F': 'XPD/USD', 'RB=F': 'RBOB/USD', 'LGO=F': 'GASOIL/USD', 'ZC=F': 'CORN/USD', 'ZW=F': 'WHEAT/USD', 'KC=F': 'COFFEE/USD',
  'SB=F': 'SUGAR/USD', 'CC=F': 'COCOA/USD', 'CT=F': 'COTTON/USD', 'ZO=F': 'OATS/USD', 'LBS=F': 'LUMBER/USD', 'SCCO': 'SCCO',
  'BTC-USD': 'BTC/USD', 'ETH-USD': 'ETH/USD', 'SOL-USD': 'SOL/USD', 'XRP-USD': 'XRP/USD', 'LINK-USD': 'LINK/USD', 'AVAX-USD': 'AVAX/USD',
  'DOGE-USD': 'DOGE/USD', 'ADA-USD': 'ADA/USD', 'LTC-USD': 'LTC/USD', 'BCH-USD': 'BCH/USD', 'EURUSD=X': 'EUR/USD',
  'GBPUSD=X': 'GBP/USD', 'NZDUSD=X': 'NZD/USD', 'CHF=X': 'USD/CHF', 'EURGBP=X': 'EUR/GBP', 'EURJPY=X': 'EUR/JPY', 'GBPJPY=X': 'GBP/JPY', 'EURCHF=X': 'EUR/CHF', 'CNH=X': 'USD/CNH', 'SGD=X': 'USD/SGD', 'HKD=X': 'USD/HKD', 'TRY=X': 'USD/TRY', 'ZAR=X': 'USD/ZAR', 'JPY=X': 'USD/JPY', 'AUDUSD=X': 'AUD/USD', 'CAD=X': 'USD/CAD',
};

// This is the server-side catalogue used by the single quote snapshot. It is
// deliberately separate from the React asset catalogue so the browser never
// needs provider credentials or to fan out one request per instrument.
const marketQuoteCatalogue = {
  XAU: 'GC=F', BTC: 'BTC-USD', ETH: 'ETH-USD', CL: 'CL=F', BRN: 'BZ=F', NG: 'NG=F', XAG: 'SI=F', HG: 'HG=F', SCCO: 'SCCO',
  HO: 'HO=F', RB: 'RB=F', PL: 'PL=F', PA: 'PA=F',
  SOL: 'SOL-USD', XRP: 'XRP-USD', DOGE: 'DOGE-USD',
  EURUSD: 'EURUSD=X', GBPUSD: 'GBPUSD=X', USDJPY: 'JPY=X', AUDUSD: 'AUDUSD=X', USDCAD: 'CAD=X', USDCHF: 'CHF=X', EURJPY: 'EURJPY=X',
  SPX: '^GSPC', NAS100: '^NDX', DJ30: '^DJI', DAX: '^GDAXI', FTSE: '^FTSE', NIKKEI: '^N225', HSI: '^HSI',
};

// The visible selector intentionally contains only the 30 focused products
// above. This separate map keeps earlier paper positions safe after the
// catalogue reduction: they can still be rendered, valued on demand, closed,
// and included in audit history, but cannot be opened as new orders.
const legacyPaperQuoteCatalogue = {
  LGO: 'LGO=F', CORN: 'ZC=F', WHEAT: 'ZW=F', COFFEE: 'KC=F',
  SUGAR: 'SB=F', COCOA: 'CC=F', COTTON: 'CT=F', OATS: 'ZO=F',
  LUMBER: 'LBS=F', SOYBEAN: 'ZS=F', SOYMEAL: 'ZM=F', SOYOIL: 'ZL=F',
  CATTLE: 'LE=F', HOGS: 'HE=F', ORANGE: 'OJ=F',
  LINK: 'LINK-USD', AVAX: 'AVAX-USD', ADA: 'ADA-USD', LTC: 'LTC-USD', BCH: 'BCH-USD',
  NZDUSD: 'NZDUSD=X', EURGBP: 'EURGBP=X', GBPJPY: 'GBPJPY=X', EURCHF: 'EURCHF=X',
  USDCNH: 'CNH=X', USDSGD: 'SGD=X', USDHKD: 'HKD=X', USDTRY: 'TRY=X', USDZAR: 'ZAR=X',
  CAC: '^FCHI', RUSSELL: '^RUT',
};

function isPaperPositionSymbol(symbol) {
  return Boolean(marketQuoteCatalogue[symbol] || legacyPaperQuoteCatalogue[symbol]);
}

// Paper orders are calculated from this server-owned contract catalogue.  The
// UI can preview the same values, but it cannot decide a contract size,
// margin requirement or realized PnL.  This keeps the sandbox coherent across
// tabs/devices and makes the admin audit a record of server-issued actions.
const paperContractSizes = {
  XAU: 100, XAG: 5_000, CL: 1_000, NG: 10_000, HG: 25_000, SCCO: 1,
  BRN: 1_000, HO: 42_000, RB: 42_000, LGO: 100, PL: 50, PA: 100,
  CORN: 5_000, WHEAT: 5_000, COFFEE: 37_500, SUGAR: 11_200,
  COCOA: 10_000, COTTON: 50_000, OATS: 5_000, LUMBER: 110,
  SOYBEAN: 5_000, SOYMEAL: 100, SOYOIL: 60_000, CATTLE: 40_000,
  HOGS: 40_000, ORANGE: 15_000,
};
const paperLeverageOverrides = {
  XAU: 500, XAG: 500, CL: 500, NG: 500, HG: 500, BRN: 500, HO: 500, RB: 500, PL: 500, PA: 500,
  SCCO: 100,
};
const paperCryptoSymbols = new Set(['BTC', 'ETH', 'SOL', 'XRP', 'DOGE']);
const paperForexSymbols = new Set(['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'EURJPY']);
const paperIndexSymbols = new Set(['SPX', 'NAS100', 'DJ30', 'DAX', 'FTSE', 'NIKKEI', 'HSI']);
const paperExecutionSpecs = {
  XAU: [0.30, 2], XAG: [0.035, 3], CL: [0.03, 3], NG: [0.006, 4], HG: [0.004, 4], SCCO: [0.04, 2],
  BRN: [0.03, 3], HO: [0.004, 4], RB: [0.004, 4], LGO: [0.80, 2], PL: [0.45, 2], PA: [0.65, 2],
  CORN: [0.25, 2], WHEAT: [0.25, 2], COFFEE: [0.30, 2], SUGAR: [0.04, 4], COCOA: [3, 2], COTTON: [0.08, 4], OATS: [0.15, 2], LUMBER: [1.5, 2],
  SOYBEAN: [0.25, 2], SOYMEAL: [0.30, 2], SOYOIL: [0.04, 4], CATTLE: [0.08, 4], HOGS: [0.08, 4], ORANGE: [0.10, 2],
  BTC: [8, 2], ETH: [0.60, 2], SOL: [0.05, 3], XRP: [0.0012, 4], LINK: [0.012, 3], AVAX: [0.012, 3], DOGE: [0.0008, 5], ADA: [0.0012, 5], LTC: [0.08, 2], BCH: [0.9, 2],
  EURUSD: [0.00012, 5], GBPUSD: [0.00014, 5], USDJPY: [0.012, 3], AUDUSD: [0.00012, 5], USDCAD: [0.00014, 5], NZDUSD: [0.00014, 5], USDCHF: [0.00014, 5], EURGBP: [0.00014, 5],
  EURJPY: [0.014, 3], GBPJPY: [0.016, 3], EURCHF: [0.00014, 5], USDCNH: [0.0005, 5], USDSGD: [0.00018, 5], USDHKD: [0.00016, 5], USDTRY: [0.012, 3], USDZAR: [0.006, 4],
  SPX: [0.80, 2], NAS100: [2, 2], DAX: [1.2, 2], FTSE: [1.2, 2], CAC: [1.2, 2], NIKKEI: [12, 2], HSI: [10, 2], DJ30: [2.2, 2], RUSSELL: [0.65, 2],
};

function getPaperInstrumentSpec(symbol) {
  if (paperCryptoSymbols.has(symbol)) return { contractSize: 1, defaultLeverage: 100, minimumLots: 0.01 };
  if (paperForexSymbols.has(symbol)) return { contractSize: 100_000, defaultLeverage: 500, minimumLots: 0.01 };
  if (paperIndexSymbols.has(symbol)) return { contractSize: 1, defaultLeverage: 100, minimumLots: 0.01 };
  return { contractSize: paperContractSizes[symbol] || 1, defaultLeverage: paperLeverageOverrides[symbol] || 100, minimumLots: 0.01 };
}

function roundPaperQuote(value, decimals) {
  return Number(Number(value).toFixed(decimals));
}

function getPaperExecutionQuote(symbol, rawQuote) {
  const reference = Number(rawQuote?.price);
  const [spread, decimals] = paperExecutionSpecs[symbol] || [Math.max(reference * 0.0005, 0.01), reference < 1 ? 5 : 2];
  const brokerBid = Number(rawQuote?.bid);
  const brokerAsk = Number(rawQuote?.ask);
  if (Number.isFinite(brokerBid) && brokerBid > 0 && Number.isFinite(brokerAsk) && brokerAsk >= brokerBid) {
    return { bid: roundPaperQuote(brokerBid, decimals), ask: roundPaperQuote(brokerAsk, decimals), decimals };
  }
  return {
    bid: roundPaperQuote(Math.max(0, reference - spread / 2), decimals),
    ask: roundPaperQuote(reference + spread / 2, decimals),
    decimals,
  };
}

// Common MT5 broker symbols differ by suffix (for example XAUUSD.a). The
// bridge normalizes only instruments that AD88 already supports. Unknown
// symbols are rejected rather than silently stored or exposed.
const mt5SymbolAliases = {
  XAUUSD: 'XAU', GOLD: 'XAU', XAGUSD: 'XAG', SILVER: 'XAG',
  BTCUSD: 'BTC', BTCUSDT: 'BTC', ETHUSD: 'ETH', ETHUSDT: 'ETH',
  USOIL: 'CL', WTI: 'CL', WTIUSD: 'CL', XTIUSD: 'CL',
  UKOIL: 'BRN', BRENT: 'BRN', BRENTUSD: 'BRN', XBRUSD: 'BRN',
  NATGAS: 'NG', NATURALGAS: 'NG', NGAS: 'NG',
  COPPER: 'HG', XCUUSD: 'HG',
  DOGEUSD: 'DOGE', ADAUSD: 'ADA', LTCUSD: 'LTC', BCHUSD: 'BCH',
  NZDUSD: 'NZDUSD', USDCHF: 'USDCHF', EURGBP: 'EURGBP', EURJPY: 'EURJPY', GBPJPY: 'GBPJPY', EURCHF: 'EURCHF', USDCNH: 'USDCNH', USDSGD: 'USDSGD', USDHKD: 'USDHKD', USDTRY: 'USDTRY', USDZAR: 'USDZAR',
  FTSE100: 'FTSE', UK100: 'FTSE', CAC40: 'CAC', FRA40: 'CAC', NIKKEI225: 'NIKKEI', JP225: 'NIKKEI', HANGSENG: 'HSI', HK50: 'HSI', US30: 'DJ30', DOW30: 'DJ30', DJ30: 'DJ30', US2000: 'RUSSELL', RUSSELL2000: 'RUSSELL',
  SUGAR: 'SUGAR', COCOA: 'COCOA', COTTON: 'COTTON', OATS: 'OATS', LUMBER: 'LUMBER', SOYBEAN: 'SOYBEAN', SOYMEAL: 'SOYMEAL', SOYOIL: 'SOYOIL', CATTLE: 'CATTLE', HOGS: 'HOGS', ORANGE: 'ORANGE',
  EURUSD: 'EURUSD', GBPUSD: 'GBPUSD', USDJPY: 'USDJPY', AUDUSD: 'AUDUSD', USDCAD: 'USDCAD',
};

function normalizeMt5Symbol(value) {
  const compact = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!compact) return null;
  if (mt5SymbolAliases[compact]) return mt5SymbolAliases[compact];
  // A conservative suffix rule supports brokers using symbols such as
  // XAUUSDm, XAUUSD.a or EURUSDpro without allowing arbitrary names.
  const alias = Object.keys(mt5SymbolAliases)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => compact.startsWith(candidate) && compact.length - candidate.length <= 8);
  return alias ? mt5SymbolAliases[alias] : (marketQuoteCatalogue[compact] ? compact : null);
}

function getActiveMt5Quote(symbol) {
  const quote = mt5QuoteCache.get(symbol);
  return quote && quote.receivedAt + mt5QuoteTtlMs >= Date.now() ? quote : null;
}

function getActiveMt5Quotes() {
  const active = [];
  for (const [symbol, quote] of mt5QuoteCache) {
    if (quote.receivedAt + mt5QuoteTtlMs >= Date.now()) active.push([symbol, quote]);
    else mt5QuoteCache.delete(symbol);
  }
  return active;
}

function overlayMt5Quotes(snapshot) {
  const active = getActiveMt5Quotes();
  if (!active.length) return snapshot;
  const result = { ...snapshot };
  for (const [symbol, quote] of active) {
    const prior = result[symbol] || {};
    result[symbol] = {
      ...prior,
      ...quote,
      // An EA may not provide a daily change or volume. Preserve the public
      // market context in that case while using its current Bid/Ask/Last.
      change24h: Number.isFinite(quote.change24h) ? quote.change24h : prior.change24h || 0,
      volume24h: Number.isFinite(quote.volume24h) ? quote.volume24h : prior.volume24h || 0,
      fallback: false,
      dataState: 'broker',
    };
  }
  return result;
}
const cryptoQuoteSymbols = new Set(['BTC', 'ETH', 'SOL', 'XRP', 'LINK', 'AVAX', 'DOGE', 'ADA', 'LTC', 'BCH']);
const internalFallbackPrices = {
  BTC: [76000, 0.4], ETH: [2400, 0.2], SOL: [93, 0.1], XRP: [1.47, 0.1], LINK: [11.3, 0.1], AVAX: [7.4, 0.1], DOGE: [0.17, 0.1], ADA: [0.62, 0.1], LTC: [84, 0.1], BCH: [390, 0.1],
};
const tradingViewSymbols = {
  XAU: ['cfd', 'OANDA:XAUUSD'], XAG: ['cfd', 'OANDA:XAGUSD'],
  CL: ['futures', 'NYMEX:CL1!'], NG: ['futures', 'NYMEX:NG1!'], HG: ['futures', 'COMEX:HG1!'], BRN: ['futures', 'ICEEUR:BRN1!'],
  HO: ['futures', 'NYMEX:HO1!'], RB: ['futures', 'NYMEX:RB1!'], LGO: ['futures', 'ICEEUR:ULS1!'], PL: ['futures', 'NYMEX:PL1!'], PA: ['futures', 'NYMEX:PA1!'],
  CORN: ['futures', 'CBOT:ZC1!'], WHEAT: ['futures', 'CBOT:ZW1!'], COFFEE: ['futures', 'ICEUS:KC1!'], DAX: ['futures', 'EUREX:FDAX1!'],
  SCCO: ['america', 'NYSE:SCCO'], SPX: ['america', 'SP:SPX'], NAS100: ['america', 'NASDAQ:NDX'],
  SUGAR: ['futures', 'ICEUS:SB1!'], COCOA: ['futures', 'ICEUS:CC1!'], COTTON: ['futures', 'ICEUS:CT1!'], OATS: ['futures', 'CBOT:ZO1!'], LUMBER: ['futures', 'CME:LBS1!'], SOYBEAN: ['futures', 'CBOT:ZS1!'], SOYMEAL: ['futures', 'CBOT:ZM1!'], SOYOIL: ['futures', 'CBOT:ZL1!'], CATTLE: ['futures', 'CME:LE1!'], HOGS: ['futures', 'CME:HE1!'], ORANGE: ['futures', 'ICEUS:OJ1!'],
  FTSE: ['cfd', 'TVC:UKX'], CAC: ['cfd', 'TVC:CAC40'], NIKKEI: ['cfd', 'TVC:NI225'], HSI: ['cfd', 'TVC:HSI'], DJ30: ['america', 'DJ:DJI'], RUSSELL: ['america', 'TVC:RUT'],
  EURUSD: ['forex', 'OANDA:EURUSD'], GBPUSD: ['forex', 'OANDA:GBPUSD'], NZDUSD: ['forex', 'OANDA:NZDUSD'], USDCHF: ['forex', 'OANDA:USDCHF'], EURGBP: ['forex', 'OANDA:EURGBP'], EURJPY: ['forex', 'OANDA:EURJPY'], GBPJPY: ['forex', 'OANDA:GBPJPY'], EURCHF: ['forex', 'OANDA:EURCHF'], USDCNH: ['forex', 'OANDA:USDCNH'], USDSGD: ['forex', 'OANDA:USDSGD'], USDHKD: ['forex', 'OANDA:USDHKD'], USDTRY: ['forex', 'OANDA:USDTRY'], USDZAR: ['forex', 'OANDA:USDZAR'], USDJPY: ['forex', 'OANDA:USDJPY'],
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
    ad88Lineage: 'Twelve Data → VENTURE FUNDS server proxy → market workspace',
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

// Gold API is a keyless spot-metal fallback for XAUUSD and XAGUSD. The public
// OANDA reference from the TradingView scanner is preferred when present: it
// tends to update more frequently and sits closer to a retail-MT5 style spot
// quote than the futures symbols GC=F/SI=F used by Yahoo.
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

async function loadTradingViewSnapshot(symbols = Object.keys(marketQuoteCatalogue)) {
  const requested = new Set(symbols);
  const groups = new Map();
  // Keep the two-second public snapshot intentionally focused on the active
  // 30-instrument trading universe. This prevents background fan-out for
  // instruments that are no longer exposed in the workspace.
  Object.entries(tradingViewSymbols).filter(([symbol]) => requested.has(symbol)).forEach(([symbol, [market, ticker]]) => {
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

function buildIndicativeReferenceChart(symbol, quote, interval = '15m') {
  const now = Math.floor(Date.now() / 1000);
  const base = quote.price;
  const intervalSeconds = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '60m': 3600, '1h': 3600, '4h': 14400, '1d': 86400, '1wk': 604800, '1mo': 2592000 }[interval] || 900;
  const timestamps = Array.from({ length: 64 }, (_, index) => now - (63 - index) * intervalSeconds);
  const change = Number(quote.change24h) || 0;
  const drift = Math.max(-0.035, Math.min(0.035, change / 100));
  const rawCloses = timestamps.map((_, index) => base * (1 - (63 - index) * drift / 63 + Math.sin(index * 0.65) * 0.00035));
  const anchor = rawCloses.at(-1) || base;
  // Keep the indicative candle shape while making the last close exactly the
  // same reference price used by the quote snapshot and execution ticket.
  const closes = rawCloses.map((value) => value + (base - anchor));
  const previousClose = quote.change24h ? base / (1 + quote.change24h / 100) : closes[0];
  return {
    ad88Fallback: false,
    ad88Source: quote.provider,
    ad88Cache: 'fresh',
    ad88ChartMode: 'indicative',
    ad88Lineage: `${quote.provider} snapshot → VENTURE FUNDS indicative chart → market workspace`,
    chart: { result: [{ meta: { regularMarketPrice: base, regularMarketTime: Math.floor(new Date(quote.quoteUpdatedAt).getTime() / 1000), previousClose, chartPreviousClose: previousClose, regularMarketDayHigh: Math.max(...closes), regularMarketDayLow: Math.min(...closes), regularMarketVolume: 0 }, timestamp: timestamps, indicators: { quote: [{ open: closes, high: closes.map((value) => value * 1.0005), low: closes.map((value) => value * 0.9995), close: closes, volume: closes.map(() => 0) }] } }] },
  };
}

async function loadYahooQuote(providerSymbol) {
  const cached = yahooQuoteCache.get(providerSymbol);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  for (const host of hosts) {
    try {
      const upstream = new URL(`https://${host}/v8/finance/chart/${encodeURIComponent(providerSymbol)}`);
      upstream.searchParams.set('range', '1d');
      upstream.searchParams.set('interval', '1m');
      const response = await fetch(upstream, { headers: { 'User-Agent': 'VENTURE-FUNDS/1.0', accept: 'application/json' }, signal: AbortSignal.timeout(6500) });
      if (!response.ok) continue;
      const payload = await response.json();
      const meta = payload?.chart?.result?.[0]?.meta;
      const price = Number(meta?.regularMarketPrice);
      if (!Number.isFinite(price) || price <= 0) continue;
      const previous = Number(meta?.previousClose ?? meta?.chartPreviousClose);
      const value = {
        price,
        change24h: previous > 0 ? ((price - previous) / previous) * 100 : 0,
        volume24h: Number(meta?.regularMarketVolume) || 0,
        quoteUpdatedAt: meta?.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString(),
        provider: 'Yahoo Finance',
        fallback: false,
      };
      yahooQuoteCache.set(providerSymbol, { expiresAt: Date.now() + yahooQuoteTtlMs, value });
      return value;
    } catch {
      // Try the second public host, then use the deterministic local quote.
    }
  }
  yahooQuoteCache.set(providerSymbol, { expiresAt: Date.now() + yahooNegativeQuoteTtlMs, value: null });
  return null;
}

async function loadLegacyPaperQuote(symbol) {
  const providerSymbol = legacyPaperQuoteCatalogue[symbol];
  if (!providerSymbol) return null;
  const cached = legacyPaperQuoteCache.get(symbol);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let quote = getActiveMt5Quote(symbol);
  if (!quote && tradingViewSymbols[symbol]) {
    try {
      quote = (await loadTradingViewSnapshot([symbol]))[symbol] || null;
    } catch {
      quote = null;
    }
  }
  if (!quote && twelveDataApiKey) {
    try { quote = await loadTwelveQuote(providerSymbol); } catch { quote = null; }
  }
  if (!quote) {
    try { quote = await loadYahooQuote(providerSymbol); } catch { quote = null; }
  }

  // Do not settle an existing position from a fabricated fallback. When every
  // upstream reference is unavailable, the position stays visible until a
  // genuine quote can be obtained again.
  if (!quote || quote.fallback) {
    legacyPaperQuoteCache.set(symbol, { expiresAt: Date.now() + 15_000, value: null });
    return null;
  }
  legacyPaperQuoteCache.set(symbol, { expiresAt: Date.now() + marketProxyTtlMs, value: quote });
  return quote;
}

async function buildMarketQuoteSnapshot() {
  const entries = Object.entries(marketQuoteCatalogue);
  const tradingViewQuotes = await loadTradingViewSnapshot();
  const values = await Promise.all(entries.map(async ([symbol, providerSymbol]) => {
    let quote = null;
    if (cryptoQuoteSymbols.has(symbol)) {
      try { quote = await loadCoinbaseQuote(providerSymbol); } catch { quote = null; }
    }
    // XAU/XAG are displayed as spot-style instruments. Use the OANDA spot
    // reference first when it is available, then a configured Twelve Data
    // quote, and only then the keyless Gold API fallback. This preserves a
    // true source change on the two-second snapshot cycle instead of pinning
    // the ticket to a public endpoint with a longer edge-cache interval.
    if (symbol === 'XAU' || symbol === 'XAG') {
      const oandaQuote = tradingViewQuotes[symbol];
      if (oandaQuote) {
        quote = {
          ...oandaQuote,
          provider: symbol === 'XAU' ? 'OANDA XAUUSD market reference' : 'OANDA XAGUSD market reference',
        };
      }
      if (!quote && twelveDataApiKey) {
        try { quote = await loadTwelveQuote(providerSymbol); } catch { quote = null; }
      }
      if (!quote) {
        try {
          quote = await loadSpotMetalQuote(symbol);
        } catch {
          quote = null;
        }
      }
    }
    // Prefer one public market snapshot for futures, FX, indices and equities.
    // This keeps the table, ticker and trade ticket on the same reference
    // cycle instead of fanning out one browser request per row.
    if (!quote) quote = tradingViewQuotes[symbol] || null;
    // Twelve Data is only a rate-bounded fallback. The free tier cannot safely
    // serve thirty real-time instruments every two seconds, while the batch
    // snapshot above can keep the whole catalogue aligned.
    if (!quote && twelveDataApiKey) {
      try { quote = await loadTwelveQuote(providerSymbol); } catch { quote = null; }
    }
    if (!quote) {
      try { quote = await loadYahooQuote(providerSymbol); } catch { quote = null; }
    }
    if (!quote) {
      const [price, change] = marketFallbackPrices[providerSymbol] || internalFallbackPrices[symbol] || [100, 0];
      quote = { price, change24h: change, volume24h: 0, quoteUpdatedAt: new Date().toISOString(), provider: 'VENTURE FUNDS fallback', fallback: true };
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

function publicMarketQuote(symbol, quote) {
  return {
    symbol,
    price: quote.price,
    bid: Number.isFinite(quote.bid) ? quote.bid : undefined,
    ask: Number.isFinite(quote.ask) ? quote.ask : undefined,
    change24h: quote.change24h,
    volume24h: quote.volume24h,
    quoteUpdatedAt: quote.quoteUpdatedAt,
    // This is intentionally a short, product-level signal rather than a
    // provider URL, broker account label, cache implementation or lineage.
    dataState: quote.dataState || (quote.fallback ? 'fallback' : 'live'),
  };
}

function writeMarketEvent(res, event, body) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(body)}\n\n`);
}

function broadcastMt5Quotes(updates) {
  if (!updates.length) return;
  for (const client of marketStreamClients) {
    const quotes = Object.fromEntries(updates
      .filter(([symbol]) => !client.symbols.size || client.symbols.has(symbol))
      .map(([symbol, quote]) => [symbol, publicMarketQuote(symbol, quote)]));
    if (Object.keys(quotes).length) {
      writeMarketEvent(client.res, 'quotes', { quotes, updatedAt: new Date().toISOString(), state: 'broker' });
    }
  }
}

async function broadcastMarketSnapshot() {
  if (!marketStreamClients.size) return;
  try {
    const snapshot = overlayMt5Quotes(await getMarketQuoteSnapshot());
    for (const client of marketStreamClients) {
      const quotes = Object.fromEntries(Object.entries(snapshot)
        .filter(([symbol]) => !client.symbols.size || client.symbols.has(symbol))
        .map(([symbol, quote]) => [symbol, publicMarketQuote(symbol, quote)]));
      if (Object.keys(quotes).length) {
        writeMarketEvent(client.res, 'quotes', { quotes, updatedAt: new Date().toISOString(), state: 'market' });
      }
    }
  } catch {
    for (const client of marketStreamClients) {
      writeMarketEvent(client.res, 'state', { connection: 'degraded', bridgeConfigured: Boolean(mt5IngestSecret), execution: 'paper' });
    }
  }
}

function ensureMarketStreamBroadcast() {
  if (marketStreamBroadcastTimer) return;
  marketStreamBroadcastTimer = setInterval(() => { void broadcastMarketSnapshot(); }, marketProxyTtlMs);
}

function parseMt5Timestamp(value) {
  if (value === undefined || value === null || value === '') return Date.now();
  let timestamp = typeof value === 'number' ? value : Date.parse(String(value));
  if (typeof value === 'number' && timestamp < 1_000_000_000_000) timestamp *= 1000;
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60_000) return null;
  return timestamp;
}

async function handleMt5TickIngest(req, res) {
  if (appSurface !== 'frontend') return sendJson(res, 404, { error: 'not found' });
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' });
  if (!mt5IngestSecret) return sendJson(res, 503, { error: 'MT5 bridge is not configured' });
  if (!safeSecretEqual(req.headers['x-ad88-mt5-key'], mt5IngestSecret)) return sendJson(res, 401, { error: 'invalid MT5 bridge key' });

  let input;
  try {
    input = await readBody(req);
  } catch {
    return sendJson(res, 400, { error: 'invalid JSON payload' });
  }
  const ticks = Array.isArray(input?.ticks) ? input.ticks : [];
  if (!ticks.length || ticks.length > 64) return sendJson(res, 400, { error: 'ticks must contain 1 to 64 items' });

  const broker = String(input.broker || 'MT5 reference feed').trim().slice(0, 80);
  const environment = input.environment === 'demo' ? 'demo' : 'reference';
  const accepted = [];
  for (const tick of ticks) {
    const symbol = normalizeMt5Symbol(tick?.symbol);
    const bid = Number(tick?.bid);
    const ask = Number(tick?.ask);
    const suppliedLast = Number(tick?.last);
    const hasBid = Number.isFinite(bid) && bid > 0;
    const hasAsk = Number.isFinite(ask) && ask > 0;
    const hasLast = Number.isFinite(suppliedLast) && suppliedLast > 0;
    const price = hasLast ? suppliedLast : hasBid && hasAsk ? (bid + ask) / 2 : hasBid ? bid : ask;
    const timestamp = parseMt5Timestamp(tick?.time);
    if (!symbol || !Number.isFinite(price) || price <= 0 || price > 1_000_000_000 || !timestamp || (hasBid && hasAsk && ask < bid)) continue;
    const prior = getActiveMt5Quote(symbol);
    const change24h = Number(tick?.change24h);
    const volume24h = Number(tick?.volume24h);
    const quote = {
      price,
      bid: hasBid ? bid : undefined,
      ask: hasAsk ? ask : undefined,
      last: hasLast ? suppliedLast : price,
      change24h: Number.isFinite(change24h) ? change24h : prior?.change24h,
      volume24h: Number.isFinite(volume24h) ? volume24h : prior?.volume24h,
      quoteUpdatedAt: new Date(timestamp).toISOString(),
      receivedAt: Date.now(),
      broker,
      environment,
      dataState: 'broker',
      fallback: false,
    };
    mt5QuoteCache.set(symbol, quote);
    accepted.push([symbol, quote]);
  }
  if (!accepted.length) return sendJson(res, 400, { error: 'no valid supported MT5 ticks' });
  mt5QuoteRevision += 1;
  broadcastMt5Quotes(accepted);
  return sendJson(res, 202, {
    accepted: accepted.map(([symbol]) => symbol),
    receivedAt: new Date().toISOString(),
    // The response intentionally never reflects the secret, broker account,
    // terminal identity, or any trading instruction.
    mode: 'read-only market reference',
  });
}

async function handleMarketStream(req, res, requestUrl) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' });
  const symbols = new Set((requestUrl.searchParams.get('symbols') || '')
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => marketQuoteCatalogue[symbol]));
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write('retry: 2500\n\n');
  const client = { res, symbols };
  const close = () => {
    marketStreamClients.delete(client);
    clearInterval(heartbeat);
    if (!marketStreamClients.size && marketStreamBroadcastTimer) {
      clearInterval(marketStreamBroadcastTimer);
      marketStreamBroadcastTimer = null;
    }
  };
  const heartbeat = setInterval(() => writeMarketEvent(res, 'ping', { at: new Date().toISOString() }), 15_000);
  marketStreamClients.add(client);
  ensureMarketStreamBroadcast();
  writeMarketEvent(res, 'state', { connection: 'open', bridgeConfigured: Boolean(mt5IngestSecret), execution: 'paper' });
  try {
    const rawSnapshot = await getMarketQuoteSnapshot();
    const snapshot = overlayMt5Quotes(rawSnapshot);
    const quotes = Object.fromEntries(Object.entries(snapshot)
      .filter(([symbol]) => !symbols.size || symbols.has(symbol))
      .map(([symbol, quote]) => [symbol, publicMarketQuote(symbol, quote)]));
    writeMarketEvent(res, 'snapshot', { quotes, updatedAt: new Date().toISOString() });
  } catch {
    writeMarketEvent(res, 'state', { connection: 'degraded', bridgeConfigured: Boolean(mt5IngestSecret), execution: 'paper' });
  }
  req.once('close', close);
  res.once('close', close);
}

async function proxyMarketQuotes(res, requestUrl) {
  const requested = (requestUrl.searchParams.get('symbols') || Object.keys(marketQuoteCatalogue).join(','))
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol, index, all) => marketQuoteCatalogue[symbol] && all.indexOf(symbol) === index);
  if (!requested.length) return sendJson(res, 400, { error: 'no supported market symbols' });
  const servedFromCache = Boolean(marketQuoteSnapshotCache.value && marketQuoteSnapshotCache.expiresAt > Date.now());
  const snapshot = overlayMt5Quotes(await getMarketQuoteSnapshot());
  const quotes = Object.fromEntries(requested
    .map((symbol) => [symbol, snapshot[symbol]])
    .filter(([, quote]) => quote)
    .map(([symbol, quote]) => [symbol, publicMarketQuote(symbol, quote)]));
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
    snapshotId: `${marketQuoteSnapshotCache.snapshotId || 'mkt'}-${mt5QuoteRevision}`,
    snapshotBuiltAt: marketQuoteSnapshotCache.builtAt ? new Date(marketQuoteSnapshotCache.builtAt).toISOString() : undefined,
  }));
}

async function proxyMarketStatus(res) {
  try {
    const snapshot = overlayMt5Quotes(await getMarketQuoteSnapshot());
    const ageSeconds = marketQuoteSnapshotCache.builtAt ? Math.max(0, Math.round((Date.now() - marketQuoteSnapshotCache.builtAt) / 1000)) : null;
    return sendJson(res, 200, {
      status: ageSeconds != null && ageSeconds <= 10 ? 'healthy' : 'degraded',
      quoteCount: Object.keys(snapshot).length,
      ageSeconds,
      cacheSeconds: Math.round(marketProxyTtlMs / 1000),
      snapshotId: `${marketQuoteSnapshotCache.snapshotId || 'mkt'}-${mt5QuoteRevision}`,
      snapshotBuiltAt: marketQuoteSnapshotCache.builtAt ? new Date(marketQuoteSnapshotCache.builtAt).toISOString() : null,
      twelveDataConfigured: Boolean(twelveDataApiKey),
      brokerFeed: {
        configured: Boolean(mt5IngestSecret),
        activeSymbols: getActiveMt5Quotes().map(([symbol]) => symbol),
        maxAgeSeconds: getActiveMt5Quotes().length ? Math.max(...getActiveMt5Quotes().map(([, quote]) => Math.max(0, Math.round((Date.now() - quote.receivedAt) / 1000)))) : null,
      },
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
  // free-provider quote to one upstream request about every two seconds.
  // That keeps normal commodities and FX within the requested 0–10 second
  // display window without burning through free API quotas.
  const cacheTtlMs = marketProxyTtlMs;
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
      // Read exactly the same normalized snapshot used by the price tile,
      // trade ticket and SSE feed. Previously this branch fetched Gold API a
      // second time, so the last candle could lag or disagree with the XAU
      // order price while a new market quote was already visible.
      const snapshot = overlayMt5Quotes(await getMarketQuoteSnapshot());
      const chartQuote = snapshot[spotSymbol];
      if (!chartQuote || chartQuote.fallback) throw new Error('spot quote unavailable');
      const body = JSON.stringify(buildIndicativeReferenceChart(symbol, chartQuote, interval));
      marketProxyCache.set(cacheKey, { expiresAt: Date.now() + cacheTtlMs, body, provider: 'market-snapshot' });
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('x-ad88-cache', 'fresh');
      res.setHeader('x-ad88-provider', chartQuote.provider || 'market-snapshot');
      res.end(body);
      return;
    } catch {
      // Fall through to the configured API or public futures fallback.
    }
  }

  // The normalized snapshot is the authoritative live quote for commodities,
  // FX, indices and equities. When a free chart upstream cannot provide a
  // historical series, keep the chart anchored to that same live quote rather
  // than falling back to an unrelated stale contract price. The resulting
  // candles are explicitly marked indicative; they are not presented as a
  // fabricated exchange order book or a live execution feed.
  const snapshotEntry = Object.entries(marketQuoteCatalogue).find(([, providerSymbol]) => providerSymbol === symbol);
  if (snapshotEntry && !cryptoQuoteSymbols.has(snapshotEntry[0])) {
    try {
      const snapshot = overlayMt5Quotes(await getMarketQuoteSnapshot());
      const quote = snapshot[snapshotEntry[0]];
      if (quote && !quote.fallback) {
        const body = JSON.stringify(buildIndicativeReferenceChart(symbol, quote, interval));
        marketProxyCache.set(cacheKey, { expiresAt: Date.now() + cacheTtlMs, body, provider: 'market-snapshot' });
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('x-ad88-cache', 'fresh');
        res.setHeader('x-ad88-provider', quote.provider || 'market-snapshot');
        res.end(body);
        return;
      }
    } catch {
      // Continue to Twelve Data/Yahoo if the synchronized snapshot is not ready.
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
        const response = await fetch(candidate, { headers: { 'User-Agent': 'VENTURE-FUNDS/1.0', accept: 'application/json' }, signal: AbortSignal.timeout(6500) });
        const body = await response.text();
        lastStatus = response.status;
        lastBody = body;
        if (!response.ok) continue;
        const payload = JSON.parse(body);
        const normalizedBody = JSON.stringify({ ...payload, ad88Fallback: false, ad88Source: 'Yahoo Finance', ad88Cache: 'fresh', ad88Lineage: `${candidate.hostname} → VENTURE FUNDS server proxy → market workspace` });
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
      res.end(JSON.stringify({ ...buildMarketFallback(symbol), ad88Source: 'VENTURE FUNDS market fallback', ad88Cache: 'stale' }));
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
      const response = await fetch(upstream, { headers: { 'User-Agent': 'VENTURE-FUNDS/1.0', accept: 'application/json' }, signal: AbortSignal.timeout(6500) });
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
    const response = await fetch(gdelt, { headers: { 'User-Agent': 'VENTURE-FUNDS/1.0', accept: 'application/json' }, signal: AbortSignal.timeout(6500) });
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
    ['Bitcoin holds near recent range as liquidity stays cautious', 'VENTURE FUNDS Market Desk', 'Crypto', 'United States'],
    ['Gold and dollar focus turns to the next inflation signal', 'VENTURE FUNDS Macro Desk', 'Metals / FX', 'United States'],
    ['Crude oil and natural gas prices track inventory expectations', 'VENTURE FUNDS Energy Desk', 'Energy', 'United States'],
    ['Copper demand outlook keeps industrial metals in focus', 'VENTURE FUNDS Metals Desk', 'Metals', 'China'],
    ['Central-bank language keeps major currency pairs moving', 'VENTURE FUNDS FX Desk', 'FX', 'European Union'],
  ].map(([title, publisher, market, country], index) => ({
    uuid: `ad88-fallback-${index + 1}`,
    title,
    publisher: `${publisher} · ${country}`,
    link: '',
    providerPublishTime: now - index * 1800,
    type: 'fallback',
    market,
  }));
  const body = JSON.stringify({ news: fallbackNews, ad88Fallback: true, ad88Source: `VENTURE FUNDS resilient fallback (${lastError || 'upstreams unavailable'})` });
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('x-ad88-news-cache', 'fallback');
  res.setHeader('x-ad88-news-provider', 'VENTURE FUNDS fallback');
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
        const account = { id: 'env-admin', name: 'VENTURE FUNDS Administrator', email: adminEmail, phone: '', country: 'Global', role: 'admin', status: 'active', tier: 'Enterprise', tradingScore: 100, joinedAt: new Date().toISOString() };
        return sendJson(res, 200, sessionResponse(account));
      }
      return forwardToRemoteApi(req, res, requestUrl, input, true);
    }
    if (appSurface === 'admin' && remoteApiOrigin && (requestUrl.pathname.startsWith('/api/admin/') || requestUrl.pathname.startsWith('/api/support/') || requestUrl.pathname.startsWith('/api/sync') || requestUrl.pathname.startsWith('/api/trades') || requestUrl.pathname.startsWith('/api/ledger') || requestUrl.pathname === '/api/content-settings' || requestUrl.pathname === '/api/market' || requestUrl.pathname === '/api/market/quotes' || requestUrl.pathname === '/api/market/status' || requestUrl.pathname === '/api/news')) {
      // The bridge authenticates only the server-to-server hop. A browser
      // request still must carry a valid administrator session before this
      // service may attach that bridge to a protected frontend API request.
      const privateAdminProxy = requestUrl.pathname.startsWith('/api/admin/')
        || requestUrl.pathname.startsWith('/api/support/')
        || requestUrl.pathname.startsWith('/api/sync')
        || requestUrl.pathname.startsWith('/api/trades')
        || requestUrl.pathname.startsWith('/api/ledger');
      if (privateAdminProxy && !requireSession(req, res, 'admin')) return;
      return forwardToRemoteApi(req, res, requestUrl, undefined, true);
    }
    if (requestUrl.pathname.startsWith('/api/auth/')) {
      const handled = await handleAuth(req, res, requestUrl);
      if (handled !== false) return;
    }
    if (requestUrl.pathname === '/api/content-settings') return handleContentSettings(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/paper/')) return handlePaperTrading(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/admin/market-scenarios')) return handleAdminTimedScenarios(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/market-scenarios')) return handleTimedScenarios(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/admin/trades')) return handleAdminTrades(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/admin/notifications')) return handleAdminNotifications(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/admin/funding/')) return handleAdminFunding(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/admin/credits/')) return handleAdminCredits(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/admin/')) return handleAdmin(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/trades')) return handleTrades(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/funding/')) return handleFunding(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/ledger')) return handleLedger(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/credits/')) return handleCredits(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/profile')) return handleProfile(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/support/')) return handleSupport(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/notifications')) return handleNotifications(req, res, requestUrl);
    if (requestUrl.pathname.startsWith('/api/sync')) return handleSync(req, res, requestUrl);
    if (requestUrl.pathname === '/api/mt5/ticks') return handleMt5TickIngest(req, res);
    if (requestUrl.pathname === '/api/market/stream') return handleMarketStream(req, res, requestUrl);
    if (requestUrl.pathname === '/api/market/status') return proxyMarketStatus(res);
    if (requestUrl.pathname === '/api/market/quotes') return proxyMarketQuotes(res, requestUrl);
    if (requestUrl.pathname === '/api/market') return proxyMarket(res, requestUrl);
    if (requestUrl.pathname === '/api/news') return proxyNews(res, requestUrl);
    await serveFile(res, requestUrl.pathname);
  } catch (error) {
    sendJson(res, 502, { error: error instanceof Error ? error.message : 'request failed' });
  }
});

// Resolve due observations in the background as well as on reads. The client
// still polls for the updated record, but a quiet tab or a separate admin
// console cannot leave an expired observation waiting for a manual click.
const timedScenarioSettlementTimer = appSurface === 'frontend'
  ? setInterval(() => {
      void databaseReady
        .then(() => settleDueTimedScenarios())
        .catch(() => undefined);
    }, 2_000)
  : null;
timedScenarioSettlementTimer?.unref?.();

// Render services can sleep, so reads also invoke pruning. This low-frequency
// timer keeps both the frontend and the independent admin service tidy while
// they are awake, with the cutoff anchored to Kuala Lumpur local midnight.
const supportPruneTimer = setInterval(() => {
  void databaseReady
    .then(() => pruneSupportMessages())
    .catch(() => undefined);
}, 60_000);
supportPruneTimer.unref?.();

server.listen(port, '0.0.0.0', () => {
  console.log(`VENTURE FUNDS server listening on ${port}`);
  if (!process.env.DATABASE_URL) console.warn('DATABASE_URL is not set; account data is not persistent across restarts.');
  if (!adminEmail || !adminPassword) console.warn('AD88_ADMIN_EMAIL / AD88_ADMIN_PASSWORD are not set; admin login is disabled.');
});
