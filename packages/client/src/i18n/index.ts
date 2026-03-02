export { I18nProvider, useI18n } from './context';
export {
  defaultLanguage as DEFAULT_LANGUAGE,
  supportedLanguages as SUPPORTED_LANGUAGES,
  type Language,
} from './i18n';

/** @deprecated Use useTranslation() from react-i18next directly */
export type I18nKey = string;
