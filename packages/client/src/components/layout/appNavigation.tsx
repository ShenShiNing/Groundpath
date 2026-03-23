import { Database, LayoutDashboard, Trash2, type LucideIcon } from 'lucide-react';

export type AppNavItemLabelKey =
  | 'nav.dashboard'
  | 'nav.chat'
  | 'nav.knowledgeBases'
  | 'nav.trash';

export interface AppNavItem {
  labelKey: AppNavItemLabelKey;
  to: string;
  icon: LucideIcon;
}

export const sidebarNavItems: AppNavItem[] = [
  { labelKey: 'nav.dashboard', to: '/dashboard', icon: LayoutDashboard },
  { labelKey: 'nav.knowledgeBases', to: '/knowledge-bases', icon: Database },
  { labelKey: 'nav.trash', to: '/trash', icon: Trash2 },
];

export function matchesNavPath(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}
