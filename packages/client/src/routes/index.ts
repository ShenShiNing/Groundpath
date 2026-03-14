import { rootRoute } from './__root';
import { indexRoute } from './index.route';
import { aboutRoute } from './about.route';
import { loginRoute } from './auth/login.route';
import { signupRoute } from './auth/signup.route';
import { forgotPasswordRoute } from './auth/forgot-password.route';
import { callbackRoute } from './auth/callback.route';
import { authenticatedRoute } from './authenticated.route';
import { profileRoute } from './profile.route';
import { securityRoute } from './security.route';
import { sessionsRoute } from './sessions.route';
import { dashboardRoute } from './dashboard.route';
import { chatRoute } from './chat.route';
import { documentDetailRoute } from './documents.$id.route';
import { trashRoute } from './trash.route';
import { knowledgeBasesRoute } from './knowledge-bases.route';
import { knowledgeBaseDetailRoute } from './knowledge-bases.$id.route';
import { aiSettingsRoute } from './settings.ai.route';

export const routeTree = rootRoute.addChildren([
  indexRoute,
  aboutRoute,
  loginRoute,
  signupRoute,
  forgotPasswordRoute,
  callbackRoute,
  authenticatedRoute.addChildren([
    profileRoute,
    securityRoute,
    sessionsRoute,
    dashboardRoute,
    chatRoute,
    documentDetailRoute,
    trashRoute,
    knowledgeBasesRoute,
    knowledgeBaseDetailRoute,
    aiSettingsRoute,
  ]),
]);
