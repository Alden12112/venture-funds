import type { LanguageCode, SharedContentSetting } from '@/types';

export const MARKET_OBSERVATION_SAFETY_KEY = 'market.observationSafety';
export const MARKET_SCENARIO_SCALE_KEY = 'market.scenarioScale';
export const MARKET_SCENARIO_SCALE_HINT_KEY = 'market.scenarioScaleHint';

export const MARKET_OBSERVATION_CONTENT_KEYS = [
  MARKET_SCENARIO_SCALE_KEY,
  MARKET_SCENARIO_SCALE_HINT_KEY,
  MARKET_OBSERVATION_SAFETY_KEY,
] as const;

export type MarketObservationContentKey = (typeof MARKET_OBSERVATION_CONTENT_KEYS)[number];

export const defaultSharedContent: Record<string, Record<LanguageCode, string>> = {
  [MARKET_SCENARIO_SCALE_KEY]: {
    zh: '观察额度（USDT显示）',
    ms: 'Jumlah pemerhatian (paparan USDT)',
    en: 'Observation amount (USDT display)',
  },
  [MARKET_SCENARIO_SCALE_HINT_KEY]: {
    zh: '用于观察市场，最低为 10 USDT；仅用于记录，不代表账户余额或收益',
    ms: 'Untuk memerhati pasaran, minimum 10 USDT; hanya untuk rekod, bukan baki atau keuntungan akaun',
    en: 'For market observation, minimum 10 USDT; record display only, not an account balance or return',
  },
  [MARKET_OBSERVATION_SAFETY_KEY]: {
    zh: '用于观察市场；不执行真实订单或改变余额。',
    ms: 'Untuk memerhati pasaran; tiada pesanan langsung atau perubahan baki.',
    en: 'For market observation; no live orders or balance changes.',
  },
};

export function getDefaultSharedContentSetting(key: string): SharedContentSetting {
  const values = defaultSharedContent[key] ?? { zh: '', ms: '', en: '' };
  return { key, values: { zh: values.zh, ms: values.ms, en: values.en } };
}

export function getSharedContentValue(settings: SharedContentSetting[], key: string, language: LanguageCode) {
  const setting = settings.find((item) => item.key === key);
  return setting?.values[language] || getDefaultSharedContentSetting(key).values[language];
}
