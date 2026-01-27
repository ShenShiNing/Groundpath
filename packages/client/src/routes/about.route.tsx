import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './__root';
import AboutPage from '@/pages/About';

export const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: AboutPage,
});
