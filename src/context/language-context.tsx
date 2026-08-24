import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { LanguageCode } from '@/types';
import { writeStorage } from '@/lib/storage';
import { translations, type TranslationKey } from '@/i18n/translations';

interface LanguageContextValue {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // AD88 is intentionally English-first. Existing local language preferences
  // are not allowed to fragment the platform into mixed-language screens.
  const [language, setLanguageState] = useState<LanguageCode>('en');

  useEffect(() => {
    document.documentElement.lang = 'en';
    writeStorage('language', 'en');
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage: () => setLanguageState('en'),
      t: (key) => translations[language][key] ?? key,
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used inside LanguageProvider');
  }
  return context;
}
