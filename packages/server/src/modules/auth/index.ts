// Controllers
export * from './controllers/auth.controller';

// Services
export * from './services/auth.service';
export * from './services/session.service';
export * from './services/password.service';
export * from './services/token.service';
export * from './services/token-cleanup.service';

// Repositories
export * from './repositories/refresh-token.repository';
export * from './repositories/user-auth.repository';
export * from './repositories/login-log.repository';

// Verification (sub-module)
export * from './verification/email.controller';
export * from './verification/email.service';
export * from './verification/email-verification.service';
export * from './verification/email-verification.repository';

// OAuth (sub-module)
export * from './oauth/oauth.types';
export * from './oauth/oauth.service';
export * from './oauth/oauth.controller';
export { githubProvider } from './oauth/providers/github.provider';
export { googleProvider } from './oauth/providers/google.provider';

// Routes
export { default as authRoutes } from './auth.routes';
export { default as emailRoutes } from './verification/email.routes';
export { default as oauthRoutes } from './oauth/oauth.routes';
