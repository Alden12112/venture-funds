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
    zh: '用于观察市场，最低为 10 USDT；仅用于记录，不代表账户余额或收益。',
    ms: 'Untuk memerhati pasaran, minimum 10 USDT; hanya untuk rekod, bukan baki atau keuntungan akaun.',
    en: 'For market observation, minimum 10 USDT; record display only, not an account balance or return.',
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
    zh: '用于观察市场；不执行真实订单或改变余额。',
    ms: 'Untuk memerhati pasaran; tiada pesanan langsung atau perubahan baki.',
    en: 'For market observation; no live orders or balance changes.',
  },
  [MARKET_SCENARIO_WORKSPACE_SAFETY_KEY]: {
    zh: '用于观察市场；不执行真实订单或改变余额。',
    ms: 'Untuk memerhati pasaran; tiada pesanan langsung atau perubahan baki.',
    en: 'For market observation; no live orders or balance changes.',
  },
  [MARKET_SCENARIO_DIALOG_SAFETY_KEY]: {
    zh: '用于观察市场；不执行真实订单或改变余额。',
    ms: 'Untuk memerhati pasaran; tiada pesanan langsung atau perubahan baki.',
    en: 'For market observation; no live orders or balance changes.',
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
};

export function getDefaultSharedContentSetting(key: string): SharedContentSetting {
  const values = defaultSharedContent[key] ?? { zh: '', ms: '', en: '' };
  return { key, values: { zh: values.zh, ms: values.ms, en: values.en } };
}

export function getSharedContentValue(settings: SharedContentSetting[], key: string, language: LanguageCode) {
  const setting = settings.find((item) => item.key === key);
  if (!setting) return getDefaultSharedContentSetting(key).values[language];
  // An empty string is a deliberate editor value, not a missing value. This
  // lets administrators hide optional labels/notes without them reappearing
  // from the bundled defaults.
  return Object.prototype.hasOwnProperty.call(setting.values, language)
    ? setting.values[language]
    : getDefaultSharedContentSetting(key).values[language];
}
