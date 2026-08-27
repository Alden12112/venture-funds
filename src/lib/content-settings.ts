import type { LanguageCode, SharedContentSetting } from '@/types';

export const MARKET_OBSERVATION_SAFETY_KEY = 'market.observationSafety';

export const defaultSharedContent: Record<string, Record<LanguageCode, string>> = {
  [MARKET_OBSERVATION_SAFETY_KEY]: {
    zh: '仅用于市场观察，不创建真实订单或改变余额。',
    ms: 'Untuk pemerhatian pasaran sahaja; tiada pesanan langsung atau perubahan baki.',
    en: 'Market observation only; no live orders or balance changes.',
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
