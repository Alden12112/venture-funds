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

function isLanguageCode(value: unknown): value is LanguageCode {
  return value === 'en' || value === 'zh' || value === 'ms';
}

function initialLanguage() {
  const stored = readStorage<unknown>('language', 'en');
  return isLanguageCode(stored) ? stored : 'en';
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(initialLanguage);

  const setLanguage = (next: LanguageCode) => {
    // Update the document locale before descendants render so date/number
    // formatters and chart axis labels switch in the same paint as the copy.
    if (typeof document !== 'undefined') document.documentElement.lang = next === 'zh' ? 'zh-CN' : next;
    setLanguageState(next);
  };

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : language;
    // A display preference belongs to this browser. Do not push it into the
    // shared account state or create a cross-device refresh loop.
    writeStorage('language', language, { sync: false });
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
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
