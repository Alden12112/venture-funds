import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { LanguageCode } from '@/types';
import { readStorage, writeStorage } from '@/lib/storage';
import { translations, type TranslationKey } from '@/i18n/translations';

interface LanguageContextValue {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(() => readStorage('language', 'zh'));

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : language;
    writeStorage('language', language);
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage: setLanguageState,
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
