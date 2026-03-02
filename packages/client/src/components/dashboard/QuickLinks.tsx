import { Link } from '@tanstack/react-router';
import { User, Monitor, MessageSquare, Settings } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const quickLinks = [
  {
    labelKey: 'quickLinks.profile.label',
    descriptionKey: 'quickLinks.profile.description',
    to: '/profile',
    icon: <User className="size-5" />,
  },
  {
    labelKey: 'quickLinks.sessions.label',
    descriptionKey: 'quickLinks.sessions.description',
    to: '/sessions',
    icon: <Monitor className="size-5" />,
  },
  {
    labelKey: 'quickLinks.chat.label',
    descriptionKey: 'quickLinks.chat.description',
    to: '/chat',
    icon: <MessageSquare className="size-5" />,
  },
  {
    labelKey: 'quickLinks.settings.label',
    descriptionKey: 'quickLinks.settings.description',
    to: '/settings/ai',
    icon: <Settings className="size-5" />,
  },
] as const;

function QuickLinkCard({ link }: { link: (typeof quickLinks)[number] }) {
  const { t } = useTranslation('dashboard');

  return (
    <Link to={link.to as string}>
      <Card className={cn('transition-colors hover:bg-muted/50 cursor-pointer', 'h-full')}>
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {link.icon}
          </div>
          <div>
            <p className="font-medium">{t(link.labelKey)}</p>
            <p className="text-xs text-muted-foreground">{t(link.descriptionKey)}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function QuickLinks() {
  const { t } = useTranslation('dashboard');

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">{t('quickLinks.title')}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {quickLinks.map((link) => (
          <QuickLinkCard key={link.to} link={link} />
        ))}
      </div>
    </div>
  );
}
