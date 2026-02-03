import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './__root';
import { requireAuth } from './guards/auth.guard';
import AISettingsPage from '@/pages/AISettingsPage';

export const aiSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/ai',
  beforeLoad: requireAuth,
  component: AISettingsPage,
});
