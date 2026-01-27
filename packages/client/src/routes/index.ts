import { rootRoute } from './__root';
import { indexRoute } from './index.route';
import { aboutRoute } from './about.route';

export const routeTree = rootRoute.addChildren([indexRoute, aboutRoute]);
