import { Suspense, useCallback } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import i18n, { type Language, supportedLanguages } from './i18n';

const STORAGE_KEY = 'knowledge-agent.language';

type MessageParams = Record<string, string | number>;

/**
 * Bridge hook: delegates to react-i18next internally while keeping
 * the same API surface that existing components expect.
 * Will be removed in Phase 4 after all files migrate to useTranslation().
 */
export function useI18n() {
  const { t: i18nextT, i18n: i18nInstance } = useTranslation();

  const language = (
    supportedLanguages.includes(i18nInstance.language as Language) ? i18nInstance.language : 'zh-CN'
  ) as Language;

  const setLanguage = useCallback(
    (nextLanguage: Language) => {
      void i18nInstance.changeLanguage(nextLanguage);
      localStorage.setItem(STORAGE_KEY, nextLanguage);
      document.documentElement.lang = nextLanguage;
    },
    [i18nInstance]
  );

  const toggleLanguage = useCallback(() => {
    const next: Language = language === 'zh-CN' ? 'en-US' : 'zh-CN';
    setLanguage(next);
  }, [language, setLanguage]);

  const t = useCallback(
    (key: string, params?: MessageParams) => {
      // Split flat key like "auth.login.submit" into [namespace, nested key]
      const dotIndex = key.indexOf('.');
      if (dotIndex === -1) {
        return i18nextT(key, params as Record<string, string>);
      }
      const nsCandidate = key.slice(0, dotIndex);
      const restKey = key.slice(dotIndex + 1);

      // Check if this looks like one of our namespaces
      const knownNamespaces = [
        'common',
        'language',
        'app',
        'auth',
        'chat',
        'dashboard',
        'home',
        'knowledgeBase',
        'document',
        'profile',
        'session',
        'settings',
        'errors',
      ];
      if (knownNamespaces.includes(nsCandidate)) {
        return i18nextT(`${nsCandidate}:${restKey}`, params as Record<string, string>);
      }

      return i18nextT(key, params as Record<string, string>);
    },
    [i18nextT]
  );

  return { language, setLanguage, toggleLanguage, t };
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <Suspense fallback={null}>{children}</Suspense>
    </I18nextProvider>
  );
}
