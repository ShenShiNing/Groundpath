import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

export const supportedLanguages = ['zh-CN', 'en-US'] as const;
export type Language = (typeof supportedLanguages)[number];
export const defaultLanguage: Language = 'zh-CN';

export const defaultNS = 'common';
export const allNamespaces = [
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
] as const;

void i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    supportedLngs: supportedLanguages,
    fallbackLng: defaultLanguage,
    defaultNS,
    ns: ['common', 'language', 'app'],
    partialBundledLanguages: true,

    interpolation: {
      escapeValue: false,
    },

    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },

    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'knowledge-agent.language',
      caches: ['localStorage'],
    },

    react: {
      useSuspense: true,
    },
  });

export default i18n;
