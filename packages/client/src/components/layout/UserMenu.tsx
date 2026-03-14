import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import {
  LogOut,
  User,
  Settings,
  Monitor,
  ChevronDown,
  Languages,
  Sun,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTheme } from '@/components/theme/theme-provider';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';

function getUserInitials(username?: string, email?: string): string {
  if (username) return username.slice(0, 2).toUpperCase();
  if (email) return email.slice(0, 2).toUpperCase();
  return 'U';
}

export interface UserMenuProps {
  onLogout: () => void;
  isCollapsed: boolean;
}

function MenuItemContent({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

export function UserMenu({ onLogout, isCollapsed }: UserMenuProps) {
  const { t, i18n } = useTranslation(['app', 'common', 'language']);
  const { theme, setTheme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const userInitials = getUserInitials(user?.username, user?.email);
  const displayName = user?.username ?? t('user', { ns: 'common' });
  const currentLanguage =
    i18n.resolvedLanguage === 'en-US' || i18n.language === 'en-US' ? 'en-US' : 'zh-CN';

  const handleThemeChange = (value: string) => {
    if (value === 'system' || value === 'dark' || value === 'light') {
      setTheme(value);
    }
  };

  const handleLanguageChange = (value: string) => {
    if (value !== 'zh-CN' && value !== 'en-US') return;
    void i18n.changeLanguage(value);
    localStorage.setItem('knowledge-agent.language', value);
    document.documentElement.lang = value;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex w-full items-center rounded-md text-sm transition-colors hover:bg-accent',
            isCollapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2 text-left'
          )}
        >
          <Avatar size="sm">
            <AvatarImage src={user?.avatarUrl ?? undefined} alt={displayName} />
            <AvatarFallback className="text-xs">{userInitials}</AvatarFallback>
          </Avatar>
          {!isCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{displayName}</p>
              </div>
              <ChevronDown className="size-4 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={isCollapsed ? 'center' : 'start'}
        side={isCollapsed ? 'right' : 'top'}
        className="w-56"
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to="/profile">
              <MenuItemContent icon={<User className="size-4" />} label={t('userMenu.profile')} />
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/security">
              <MenuItemContent
                icon={<ShieldCheck className="size-4" />}
                label={t('userMenu.security')}
              />
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/sessions">
              <MenuItemContent
                icon={<Monitor className="size-4" />}
                label={t('userMenu.sessions')}
              />
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <MenuItemContent
              icon={<Sun className="size-4" />}
              label={t('theme', { ns: 'common' })}
            />
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            <DropdownMenuRadioGroup value={theme} onValueChange={handleThemeChange}>
              <DropdownMenuRadioItem value="system">
                {t('userMenu.themeSystem', { ns: 'app' })}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                {t('userMenu.themeDark', { ns: 'app' })}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="light">
                {t('userMenu.themeLight', { ns: 'app' })}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <MenuItemContent
              icon={<Languages className="size-4" />}
              label={t('language', { ns: 'common' })}
            />
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            <DropdownMenuRadioGroup value={currentLanguage} onValueChange={handleLanguageChange}>
              <DropdownMenuRadioItem value="zh-CN">
                {t('zh', { ns: 'language' })}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="en-US">
                {t('en', { ns: 'language' })}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem asChild>
          <Link to="/settings/ai">
            <MenuItemContent
              icon={<Settings className="size-4" />}
              label={t('userMenu.settings')}
            />
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onLogout}>
          <MenuItemContent icon={<LogOut className="size-4" />} label={t('userMenu.logOut')} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
