import { useState } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import {
  Brain,
  LogOut,
  Menu,
  LayoutDashboard,
  MessageSquare,
  User,
  Settings,
  Monitor,
  FileText,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { ModeToggle } from '@/components/theme/mode-toggle';
import { useAuthStore } from '@/stores';
import { authApi } from '@/api';

// ============================================================================
// Types
// ============================================================================

interface AppLayoutProps {
  children: React.ReactNode;
  showFooter?: 'full' | 'simple' | 'none';
}

interface NavItem {
  label: string;
  to: string;
  icon?: React.ReactNode;
}

// ============================================================================
// Constants
// ============================================================================

const authenticatedNavItems: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: <LayoutDashboard className="size-4" /> },
  { label: 'Documents', to: '/documents', icon: <FileText className="size-4" /> },
  { label: 'Chat', to: '/chat', icon: <MessageSquare className="size-4" /> },
];

const publicNavItems: NavItem[] = [
  { label: 'Features', to: '/' },
  { label: 'Docs', to: '/' },
  { label: 'Pricing', to: '/' },
];

const footerLinks = {
  product: [
    { label: 'Features', to: '/' },
    { label: 'Integrations', to: '/' },
    { label: 'Security', to: '/' },
  ],
  resources: [
    { label: 'Documentation', to: '/' },
    { label: 'API Reference', to: '/' },
    { label: 'Community', to: '/' },
  ],
  company: [
    { label: 'About', to: '/' },
    { label: 'Blog', to: '/' },
    { label: 'Careers', to: '/' },
  ],
};

// ============================================================================
// Sub-components
// ============================================================================

function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Brain className="size-5" />
      </div>
      <span className="text-lg font-bold">KnowledgeAgent</span>
    </div>
  );
}

function NavLink({ item, className }: { item: NavItem; className?: string }) {
  return (
    <Link
      to={item.to}
      className={cn(
        'text-sm font-medium text-muted-foreground hover:text-foreground transition-colors',
        className
      )}
    >
      {item.label}
    </Link>
  );
}

function FooterLinkSection({
  title,
  links,
}: {
  title: string;
  links: { label: string; to: string }[];
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold mb-4">{title}</h4>
      <ul className="space-y-3 text-sm text-muted-foreground">
        {links.map((link) => (
          <li key={link.label}>
            <Link to={link.to} className="hover:text-foreground transition-colors">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

function getUserInitials(username?: string, email?: string): string {
  if (username) return username.slice(0, 2).toUpperCase();
  if (email) return email.slice(0, 2).toUpperCase();
  return 'U';
}

function getUserDisplayName(username?: string): string {
  return username ?? 'User';
}

// ============================================================================
// User Menu Component
// ============================================================================

function UserMenu({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuthStore();
  const userInitials = getUserInitials(user?.username, user?.email);
  const displayName = getUserDisplayName(user?.username);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full">
          <Avatar size="sm">
            <AvatarImage src={user?.avatarUrl ?? undefined} alt={displayName} />
            <AvatarFallback>{userInitials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to={'/profile' as string}>
              <User />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to={'/settings' as string}>
              <Settings />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to={'/sessions' as string}>
              <Monitor />
              Sessions
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onLogout}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================================
// Mobile Navigation Component
// ============================================================================

function MobileNav({
  isAuthenticated,
  onLogout,
}: {
  isAuthenticated: boolean;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { user } = useAuthStore();

  const navItems = isAuthenticated ? authenticatedNavItems : publicNavItems;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="size-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <SheetHeader>
          <SheetTitle asChild>
            <Logo />
          </SheetTitle>
        </SheetHeader>
        <Separator className="my-4" />
        <nav className="flex flex-col gap-2">
          {navItems.map((item) => (
            <Button
              key={item.label}
              variant="ghost"
              className="justify-start gap-2"
              asChild
              onClick={() => setOpen(false)}
            >
              <Link to={item.to}>
                {item.icon}
                {item.label}
              </Link>
            </Button>
          ))}
        </nav>
        {isAuthenticated && (
          <>
            <Separator className="my-4" />
            <div className="flex items-center gap-3 px-2">
              <Avatar size="sm">
                <AvatarImage src={user?.avatarUrl ?? undefined} alt={user?.username} />
                <AvatarFallback>{getUserInitials(user?.username, user?.email)}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{user?.username}</span>
                <span className="text-xs text-muted-foreground">{user?.email}</span>
              </div>
            </div>
            <Separator className="my-4" />
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-destructive hover:text-destructive"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              <LogOut className="size-4" />
              Log out
            </Button>
          </>
        )}
        {!isAuthenticated && (
          <>
            <Separator className="my-4" />
            <div className="flex flex-col gap-2">
              <Button variant="outline" asChild onClick={() => setOpen(false)}>
                <Link to={'/auth/login' as string}>Log in</Link>
              </Button>
              <Button asChild onClick={() => setOpen(false)}>
                <Link to={'/auth/signup' as string}>Get Started</Link>
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Desktop Navigation Component
// ============================================================================

function DesktopNav({ isAuthenticated }: { isAuthenticated: boolean }) {
  const navItems = isAuthenticated ? authenticatedNavItems : publicNavItems;

  return (
    <nav className="hidden md:flex items-center gap-1">
      {isAuthenticated
        ? navItems.map((item) => (
            <Button key={item.label} variant="ghost" size="sm" asChild>
              <Link to={item.to}>{item.label}</Link>
            </Button>
          ))
        : navItems.map((item) => <NavLink key={item.label} item={item} className="px-3" />)}
    </nav>
  );
}

// ============================================================================
// Header Component
// ============================================================================

function Header({ isAuthenticated, onLogout }: { isAuthenticated: boolean; onLogout: () => void }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="container flex h-16 items-center gap-4">
        {/* Mobile Menu */}
        <MobileNav isAuthenticated={isAuthenticated} onLogout={onLogout} />

        {/* Logo */}
        <Link to={(isAuthenticated ? '/dashboard' : '/') as string}>
          <Logo />
        </Link>

        {/* Desktop Navigation */}
        <DesktopNav isAuthenticated={isAuthenticated} />

        {/* Right Side Actions */}
        <div className="ml-auto flex items-center gap-2">
          {isAuthenticated ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <ModeToggle />
                </TooltipTrigger>
                <TooltipContent>Toggle theme</TooltipContent>
              </Tooltip>
              <UserMenu onLogout={onLogout} />
            </>
          ) : (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <ModeToggle />
                </TooltipTrigger>
                <TooltipContent>Toggle theme</TooltipContent>
              </Tooltip>
              <Button variant="ghost" size="sm" asChild className="hidden md:inline-flex">
                <Link to={'/auth/login' as string}>Log in</Link>
              </Button>
              <Button size="sm" asChild className="hidden md:inline-flex">
                <Link to={'/auth/signup' as string}>Get Started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// ============================================================================
// Footer Component
// ============================================================================

function FullFooter() {
  return (
    <div className="container">
      <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
        {/* Brand */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex size-6 items-center justify-center rounded bg-primary/10 text-primary">
              <Brain className="size-4" />
            </div>
            <span className="font-bold">KnowledgeAgent</span>
          </div>
          <p className="text-sm text-muted-foreground">The enterprise-ready RAG pipeline.</p>
        </div>

        {/* Links */}
        <FooterLinkSection title="Product" links={footerLinks.product} />
        <FooterLinkSection title="Resources" links={footerLinks.resources} />
        <FooterLinkSection title="Company" links={footerLinks.company} />
      </div>

      <Separator className="my-8" />

      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pb-4">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} KnowledgeAgent Inc. All rights reserved.
        </p>
        <div className="flex gap-6 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
          <Link to="/" className="hover:text-foreground transition-colors">
            Terms of Service
          </Link>
        </div>
      </div>
    </div>
  );
}

function SimpleFooter() {
  return (
    <div className="container flex flex-col md:flex-row justify-between items-center gap-4">
      <p className="text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} KnowledgeAgent Inc. All rights reserved.
      </p>
      <div className="flex gap-6 text-xs text-muted-foreground">
        <Link to="/" className="hover:text-foreground transition-colors">
          Privacy
        </Link>
        <Link to="/" className="hover:text-foreground transition-colors">
          Terms
        </Link>
      </div>
    </div>
  );
}

function Footer({ variant }: { variant: 'full' | 'simple' | 'none' }) {
  if (variant === 'none') return null;

  return (
    <footer className="border-t py-12">
      {variant === 'full' ? <FullFooter /> : <SimpleFooter />}
    </footer>
  );
}

// ============================================================================
// Main Layout Component
// ============================================================================

export function AppLayout({ children, showFooter = 'full' }: AppLayoutProps) {
  const router = useRouter();
  const { accessToken, refreshToken, clearAuth } = useAuthStore();
  const isAuthenticated = !!accessToken;

  const handleLogout = async () => {
    try {
      if (refreshToken) {
        await authApi.logout(refreshToken);
      }
    } finally {
      clearAuth();
      await router.navigate({ to: '/auth/login' });
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header isAuthenticated={isAuthenticated} onLogout={handleLogout} />
      <main className="flex-1">{children}</main>
      <Footer variant={showFooter} />
    </div>
  );
}
