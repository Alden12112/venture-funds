export const authModes = [
  { key: 'login', label: '登录' },
  { key: 'register', label: '注册' },
  { key: 'recover', label: '找回密码' },
] as const;

export const legalPages = [
  { key: 'terms', label: '用户协议' },
  { key: 'privacy', label: '隐私政策' },
] as const;

export const marketFilters = ['全部', 'crypto', 'commodity', 'forex', 'equity', 'index'] as const;

export const newsCategories = ['全部', '市场', '宏观', '监管', '加密市场', '能源', '金属', '外汇'] as const;

export const notificationCategories = ['全部', '系统', '行情', '任务', '资金'] as const;
