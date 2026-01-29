import { rootRoute } from './__root';
import { indexRoute } from './index.route';
import { aboutRoute } from './about.route';
import { loginRoute } from './auth/login.route';
import { signupRoute } from './auth/signup.route';

export const routeTree = rootRoute.addChildren([indexRoute, aboutRoute, loginRoute, signupRoute]);
