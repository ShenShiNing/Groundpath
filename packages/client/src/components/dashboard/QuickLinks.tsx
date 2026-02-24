import { Link } from '@tanstack/react-router';
import { User, Monitor, MessageSquare, Settings } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface QuickLink {
  label: string;
  description: string;
  to: string;
  icon: React.ReactNode;
}

const quickLinks: QuickLink[] = [
  {
    label: 'Profile',
    description: 'Edit your profile and avatar',
    to: '/profile',
    icon: <User className="size-5" />,
  },
  {
    label: 'Sessions',
    description: 'Manage active login sessions',
    to: '/sessions',
    icon: <Monitor className="size-5" />,
  },
  {
    label: 'Chat',
    description: 'Start a conversation',
    to: '/chat',
    icon: <MessageSquare className="size-5" />,
  },
  {
    label: 'Settings',
    description: 'Configure your preferences',
    to: '/settings/ai',
    icon: <Settings className="size-5" />,
  },
];

function QuickLinkCard({ link }: { link: QuickLink }) {
  return (
    <Link to={link.to as string}>
      <Card className={cn('transition-colors hover:bg-muted/50 cursor-pointer', 'h-full')}>
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {link.icon}
          </div>
          <div>
            <p className="font-medium">{link.label}</p>
            <p className="text-xs text-muted-foreground">{link.description}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function QuickLinks() {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Quick Links</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {quickLinks.map((link) => (
          <QuickLinkCard key={link.to} link={link} />
        ))}
      </div>
    </div>
  );
}
