import { rootRoute } from './__root';
import { indexRoute } from './index.route';
import { aboutRoute } from './about.route';
import { loginRoute } from './auth/login.route';
import { signupRoute } from './auth/signup.route';
import { forgotPasswordRoute } from './auth/forgot-password.route';
import { callbackRoute } from './auth/callback.route';
import { profileRoute } from './profile.route';
import { sessionsRoute } from './sessions.route';
import { dashboardRoute } from './dashboard.route';

export const routeTree = rootRoute.addChildren([
  indexRoute,
  aboutRoute,
  loginRoute,
  signupRoute,
  forgotPasswordRoute,
  callbackRoute,
  profileRoute,
  sessionsRoute,
  dashboardRoute,
]);
