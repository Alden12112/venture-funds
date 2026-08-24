export const authModes = [
  { key: 'login', label: 'Sign in' },
  { key: 'register', label: 'Create account' },
  { key: 'recover', label: 'Recover access' },
] as const;

export const legalPages = [
  { key: 'terms', label: 'Terms of use' },
  { key: 'privacy', label: 'Privacy policy' },
] as const;

export const marketFilters = ['All', 'crypto', 'commodity', 'forex', 'equity', 'index'] as const;

export const newsCategories = ['All', 'Markets', 'Macro', 'Policy', 'Crypto', 'Energy', 'Metals', 'FX'] as const;

export const notificationCategories = ['All', 'System', 'Market', 'Task', 'Funding'] as const;
