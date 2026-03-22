export const BRAND_CONFIG = {
  displayName: {
    zhCN: '溯知',
    en: 'Groundpath',
  },
  slogan: {
    zhCN: '溯源而知，一问即达',
    en: 'Trace the source. Reach the answer.',
  },
  repoName: 'groundpath',
  packageScope: '@groundpath',
  storageNamespace: 'groundpath',
  redisPrefix: 'groundpath',
  jwtIssuer: 'groundpath',
  jwtAudience: 'groundpath-client',
  emailFromName: 'Groundpath',
  openApi: {
    title: 'Groundpath API',
    descriptionZhCN: 'Groundpath 后端 API 文档',
  },
  structuredRagAlertPrefix: 'Groundpath',
} as const;

export const BRAND_STORAGE_KEYS = {
  sidebarCollapsed: `${BRAND_CONFIG.storageNamespace}.sidebar-collapsed`,
  chatScope: `${BRAND_CONFIG.storageNamespace}.chat-scope`,
} as const;
