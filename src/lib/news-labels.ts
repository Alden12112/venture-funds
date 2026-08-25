import type { TranslationKey } from '@/i18n/translations';

type Translate = (key: TranslationKey) => string;

const categoryKeys: Record<string, string> = {
  All: 'news.categoryAll', Markets: 'news.categoryMarkets', Macro: 'news.categoryMacro', Policy: 'news.categoryPolicy',
  Crypto: 'news.categoryCrypto', Energy: 'news.categoryEnergy', Metals: 'news.categoryMetals', FX: 'news.categoryFX',
};
const sentimentKeys: Record<string, string> = { positive: 'news.positive', neutral: 'news.neutral', alert: 'news.alert', 'All sentiment': 'news.allSentiment' };
const impactKeys: Record<string, string> = { low: 'news.lowImpact', medium: 'news.mediumImpact', high: 'news.highImpactLabel' };
const marketKeys: Record<string, string> = {
  Crypto: 'news.categoryCrypto', Energy: 'news.categoryEnergy', Metals: 'news.categoryMetals', FX: 'news.categoryFX',
  Equities: 'news.categoryMarkets', 'Global markets': 'news.categoryMarkets', Macro: 'news.categoryMacro', Gold: 'asset.XAU',
  'Crude Oil': 'asset.CL', 'Natural Gas': 'asset.NG', Copper: 'asset.HG', 'Southern Copper': 'asset.SCCO', 'EUR / USD': 'asset.EURUSD',
};
const countryKeys: Record<string, string> = {
  'United States': 'country.UnitedStates', China: 'country.China', 'European Union': 'country.EuropeanUnion',
  'United Kingdom': 'country.UnitedKingdom', Japan: 'country.Japan', Malaysia: 'country.Malaysia',
};
const calendarTitleKeys: Record<string, string> = {
  'US CPI release': 'news.eventUsCpi',
  'EIA crude oil inventories': 'news.eventEiaOil',
  'ECB policy remarks': 'news.eventEcbRemarks',
  'China manufacturing PMI': 'news.eventChinaPmi',
  'US employment report': 'news.eventUsEmployment',
};
const calendarDescriptionKeys: Record<string, string> = {
  'Inflation data can reshape rate expectations, the US dollar and gold direction.': 'news.eventUsCpiDescription',
  'Inventory changes commonly move energy curves and inflation trades.': 'news.eventEiaOilDescription',
  'European rate language can shift relative EUR and USD strength.': 'news.eventEcbRemarksDescription',
  'Manufacturing momentum is a leading signal for industrial-metal demand.': 'news.eventChinaPmiDescription',
  'Employment data is a core weekly event for risk assets and rate markets.': 'news.eventUsEmploymentDescription',
};

export function labelNewsCategory(value: string, t: Translate) { return categoryKeys[value] ? t(categoryKeys[value]) : value; }
export function labelNewsSentiment(value: string, t: Translate) { return sentimentKeys[value] ? t(sentimentKeys[value]) : value; }
export function labelNewsImpact(value: string, t: Translate) { return impactKeys[value] ? t(impactKeys[value]) : value; }
export function labelCountry(value: string, t: Translate) { return countryKeys[value] ? t(countryKeys[value]) : value; }
export function labelMarket(value: string, t: Translate) { return marketKeys[value] ? t(marketKeys[value]) : value.split(' / ').map((part) => marketKeys[part] ? t(marketKeys[part]) : part).join(' / '); }
export function labelCalendarTitle(value: string, t: Translate) { return calendarTitleKeys[value] ? t(calendarTitleKeys[value]) : value; }
export function labelCalendarDescription(value: string, t: Translate) { return calendarDescriptionKeys[value] ? t(calendarDescriptionKeys[value]) : value; }
export function labelNewsSummary(publisher: string, t: Translate) { return t('news.liveIndexedSummary').replace('{publisher}', publisher); }
