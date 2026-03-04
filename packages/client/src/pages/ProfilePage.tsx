import { Link } from '@tanstack/react-router';
import { ArrowLeft, UserRound, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ProfileForm } from '@/components/profile';

export function ProfilePage() {
  const { t } = useTranslation('profile');

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="shrink-0 border-b px-6 py-5">
        <Button variant="outline" className="cursor-pointer" asChild>
          <Link to="/dashboard">
            <ArrowLeft className="mr-1 size-4" />
            {t('action.backToDashboard')}
          </Link>
        </Button>

        <div className="mt-4">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {t('page.title')}
          </h1>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-6 text-sm">
          <div className="flex items-center gap-1.5">
            <UserRound className="size-4 text-primary" />
            <span className="text-muted-foreground">{t('stats.completeness')}</span>
            <span className="font-display font-semibold">{t('stats.completenessValue')}</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-primary" />
            <span className="text-muted-foreground">{t('stats.accountStatus')}</span>
            <span className="font-display font-semibold">{t('stats.accountStatusValue')}</span>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold">{t('card.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('card.description')}</p>
          <div className="mt-6">
            <ProfileForm
              onSuccess={() => {
                toast.success(t('toast.updated'));
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfilePage;
