import 'i18next';

import type common from '../../public/locales/zh-CN/common.json';
import type language from '../../public/locales/zh-CN/language.json';
import type app from '../../public/locales/zh-CN/app.json';
import type auth from '../../public/locales/zh-CN/auth.json';
import type chat from '../../public/locales/zh-CN/chat.json';
import type dashboard from '../../public/locales/zh-CN/dashboard.json';
import type home from '../../public/locales/zh-CN/home.json';
import type knowledgeBase from '../../public/locales/zh-CN/knowledgeBase.json';
import type document from '../../public/locales/zh-CN/document.json';
import type profile from '../../public/locales/zh-CN/profile.json';
import type session from '../../public/locales/zh-CN/session.json';
import type settings from '../../public/locales/zh-CN/settings.json';
import type errors from '../../public/locales/zh-CN/errors.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common;
      language: typeof language;
      app: typeof app;
      auth: typeof auth;
      chat: typeof chat;
      dashboard: typeof dashboard;
      home: typeof home;
      knowledgeBase: typeof knowledgeBase;
      document: typeof document;
      profile: typeof profile;
      session: typeof session;
      settings: typeof settings;
      errors: typeof errors;
    };
  }
}
