import type { LanguageCode, SharedContentSetting } from '@/types';

export const MARKET_SCENARIO_SCALE_KEY = 'market.scenarioScale';
export const MARKET_SCENARIO_SCALE_HINT_KEY = 'market.scenarioScaleHint';
export const MARKET_SCENARIO_SCALE_NOTE_KEY = 'market.scenarioScaleNote';
export const MARKET_SCENARIO_INPUT_NOTE_KEY = 'market.scenarioInputNote';
export const MARKET_SCENARIO_DIRECTION_HINT_KEY = 'market.scenarioDirectionHint';
export const MARKET_OBSERVATION_SAFETY_KEY = 'market.observationSafety';
export const MARKET_SCENARIO_WORKSPACE_SAFETY_KEY = 'market.scenarioWorkspaceSafety';
export const MARKET_SCENARIO_DIALOG_SAFETY_KEY = 'market.scenarioDialogSafety';
export const MARKET_SCENARIO_ADMIN_NOTE_LABEL_KEY = 'market.scenarioAdminNoteLabel';
export const FUNDING_PROCESSING_NOTE_KEY = 'funding.processingNote';
export const FUNDING_REVIEW_SAFETY_KEY = 'funding.reviewSafety';
export const SUPPORT_WHATSAPP_KEY = 'support.whatsapp';
export const SUPPORT_TELEGRAM_KEY = 'support.telegram';

export const SUPPORT_CHANNEL_CONTENT_KEYS = [SUPPORT_WHATSAPP_KEY, SUPPORT_TELEGRAM_KEY] as const;

/** A compact, explicit status label for the protected DEMO observation flow. */
export const compactObservationSafetyCopy: Record<LanguageCode, string> = {
  zh: 'DEMO 观察模式 · 仅记录；不执行真实订单、不改变余额。',
  ms: 'Mod DEMO pemerhatian · rekod sahaja; tiada pesanan sebenar atau perubahan baki.',
  en: 'DEMO observation mode · record only; no live orders or balance changes.',
};

const observationSafetyKeys = new Set<string>([
  MARKET_OBSERVATION_SAFETY_KEY,
  MARKET_SCENARIO_WORKSPACE_SAFETY_KEY,
  MARKET_SCENARIO_DIALOG_SAFETY_KEY,
]);

// A previous release used a longer sentence in these fields. The API migration
// replaces known legacy values, while this client-side guard keeps an already
// cached response from briefly bringing that sentence back into the UI.
const legacyObservationSafetyValues: Record<LanguageCode, string[]> = {
  zh: [
    ['用于观察市场', '不执行真实订单', '或改变余额'].join('；'),
    ['用于观察市场', '不执行真实订单'].join('；'),
    ['仅用于市场观察', '不创建真实订单', '或改变余额'].join('，'),
  ],
  ms: [
    ['Untuk memerhati pasaran', 'tiada pesanan langsung atau perubahan baki'].join('; '),
    ['Untuk pemerhatian pasaran sahaja', 'tiada pesanan langsung atau perubahan baki'].join('; '),
  ],
  en: [
    ['For market observation', 'no live orders or balance changes'].join('; '),
    ['Market observation only', 'no live orders or balance changes'].join('; '),
  ],
};

function normalizedCopy(value: string) {
  return String(value || '').trim().replace(/[。.!；;，,\s]+/gu, '').toLocaleLowerCase();
}

function isLegacyObservationSafetyValue(value: string, language: LanguageCode) {
  const normalized = normalizedCopy(value);
  return Boolean(normalized) && legacyObservationSafetyValues[language].some((candidate) => normalizedCopy(candidate) === normalized);
}

export const MARKET_OBSERVATION_CONTENT_KEYS = [
  MARKET_SCENARIO_SCALE_KEY,
  MARKET_SCENARIO_SCALE_HINT_KEY,
  MARKET_SCENARIO_SCALE_NOTE_KEY,
  MARKET_SCENARIO_INPUT_NOTE_KEY,
  MARKET_SCENARIO_DIRECTION_HINT_KEY,
  MARKET_OBSERVATION_SAFETY_KEY,
  MARKET_SCENARIO_WORKSPACE_SAFETY_KEY,
  MARKET_SCENARIO_DIALOG_SAFETY_KEY,
  MARKET_SCENARIO_ADMIN_NOTE_LABEL_KEY,
  FUNDING_PROCESSING_NOTE_KEY,
  FUNDING_REVIEW_SAFETY_KEY,
] as const;

export type MarketObservationContentKey = (typeof MARKET_OBSERVATION_CONTENT_KEYS)[number];

export const defaultSharedContent: Record<string, Record<LanguageCode, string>> = {
  [MARKET_SCENARIO_SCALE_KEY]: {
    zh: '观察额度（USDT显示）',
    ms: 'Jumlah pemerhatian (paparan USDT)',
    en: 'Observation amount (USDT display)',
  },
  [MARKET_SCENARIO_SCALE_HINT_KEY]: {
    zh: '设置用于记录市场观察的额度。',
    ms: 'Tetapkan jumlah untuk rekod pemerhatian pasaran.',
    en: 'Set an amount to frame this market observation.',
  },
  [MARKET_SCENARIO_SCALE_NOTE_KEY]: {
    zh: '最低为 10 USDT；仅用于记录，不代表账户余额或收益。',
    ms: 'Minimum 10 USDT; rekod sahaja, bukan baki atau keuntungan akaun.',
    en: 'Minimum 10 USDT; record only, not an account balance or return.',
  },
  [MARKET_SCENARIO_INPUT_NOTE_KEY]: {
    zh: '备注',
    ms: 'Nota',
    en: 'Note',
  },
  [MARKET_SCENARIO_DIRECTION_HINT_KEY]: {
    zh: '选择要记录的市场方向',
    ms: 'Pilih arah pasaran yang hendak direkodkan',
    en: 'Choose the market direction to record',
  },
  [MARKET_OBSERVATION_SAFETY_KEY]: {
    ...compactObservationSafetyCopy,
  },
  [MARKET_SCENARIO_WORKSPACE_SAFETY_KEY]: {
    ...compactObservationSafetyCopy,
  },
  [MARKET_SCENARIO_DIALOG_SAFETY_KEY]: {
    ...compactObservationSafetyCopy,
  },
  [MARKET_SCENARIO_ADMIN_NOTE_LABEL_KEY]: {
    zh: '备注',
    ms: 'Nota',
    en: 'Admin note',
  },
  [FUNDING_PROCESSING_NOTE_KEY]: {
    zh: '银行转账目前由客服人工协助处理；提交后会在客服中心跟进申请。',
    ms: 'Pemindahan bank kini dibantu secara manual oleh Khidmat Pelanggan; selepas dihantar, permintaan akan disusuli di Pusat Sokongan.',
    en: 'Bank transfers are currently assisted manually by Client Support; after submission, the request is followed up in the Support Center.',
  },
  [FUNDING_REVIEW_SAFETY_KEY]: {
    zh: '用于内部审核记录；不会收款、自动付款或创建银行与钱包指令。',
    ms: 'Untuk rekod semakan dalaman; tiada kutipan, bayaran automatik atau arahan bank dan dompet dibuat.',
    en: 'For internal review records; no collection, automatic payout, or bank or wallet instruction is created.',
  },
  [SUPPORT_WHATSAPP_KEY]: {
    zh: '',
    ms: '',
    en: '',
  },
  [SUPPORT_TELEGRAM_KEY]: {
    zh: '',
    ms: '',
    en: '',
  },
};

export function getDefaultSharedContentSetting(key: string): SharedContentSetting {
  const values = defaultSharedContent[key] ?? { zh: '', ms: '', en: '' };
  return { key, values: { zh: values.zh, ms: values.ms, en: values.en } };
}

export function getSharedContentValue(settings: SharedContentSetting[], key: string, language: LanguageCode) {
  const setting = settings.find((item) => item.key === key);
  const fallback = getDefaultSharedContentSetting(key).values[language];
  if (!setting) return fallback;
  // An empty string is a deliberate editor value, not a missing value. This
  // lets administrators hide optional labels/notes without them reappearing
  // from the bundled defaults.
  const value = Object.prototype.hasOwnProperty.call(setting.values, language)
    ? setting.values[language]
    : fallback;
  return observationSafetyKeys.has(key) && isLegacyObservationSafetyValue(value, language)
    ? compactObservationSafetyCopy[language]
    : value;
}
