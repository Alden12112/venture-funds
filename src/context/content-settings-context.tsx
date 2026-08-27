import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { LanguageCode, SharedContentSetting, SharedContentSettingsResponse } from '@/types';
import { apiFetch } from '@/lib/api';
import { getSharedContentValue } from '@/lib/content-settings';

interface ContentSettingsContextValue {
  settings: SharedContentSetting[];
  loading: boolean;
  lastUpdatedAt: string | null;
  refresh: () => Promise<void>;
  getContent: (key: string, language: LanguageCode) => string;
}

const ContentSettingsContext = createContext<ContentSettingsContextValue | null>(null);

export function ContentSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SharedContentSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch<SharedContentSettingsResponse>('/api/content-settings');
      const nextSettings = Array.isArray(response.settings) ? response.settings : [];
      setSettings(nextSettings);
      const timestamps = nextSettings.map((item) => item.updatedAt).filter((value): value is string => Boolean(value));
      setLastUpdatedAt(timestamps.sort().at(-1) ?? null);
    } catch {
      // The translation bundle remains the deliberate fallback while the
      // shared content API is unavailable; a failed refresh never blanks the UI.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    const handleFocus = () => void refresh();
    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
    };
  }, [refresh]);

  const value = useMemo<ContentSettingsContextValue>(() => ({
    settings,
    loading,
    lastUpdatedAt,
    refresh,
    getContent: (key, language) => getSharedContentValue(settings, key, language),
  }), [lastUpdatedAt, loading, refresh, settings]);

  return <ContentSettingsContext.Provider value={value}>{children}</ContentSettingsContext.Provider>;
}

export function useContentSettings() {
  const context = useContext(ContentSettingsContext);
  if (!context) throw new Error('useContentSettings must be used inside ContentSettingsProvider');
  return context;
}
