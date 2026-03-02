import { Link } from '@tanstack/react-router';
import { SignupForm, AuthPageLayout, AuthFooterLink } from '@/components/auth';
import { useTranslation } from 'react-i18next';

export function SignupPage() {
  const { t } = useTranslation('auth');

  return (
    <AuthPageLayout
      title={t('signup.pageTitle')}
      description={t('signup.pageDescription')}
      footer={
        <>
          <AuthFooterLink
            text={t('signup.footerText')}
            linkText={t('signup.footerLink')}
            linkTo="/auth/login"
          />
          <p className="text-center text-xs text-muted-foreground mt-4">
            {t('signup.termsPrefix')}{' '}
            <Link
              to="/about"
              className="underline underline-offset-4 hover:text-foreground cursor-pointer"
            >
              {t('signup.terms')}
            </Link>{' '}
            {t('signup.and')}{' '}
            <Link
              to="/about"
              className="underline underline-offset-4 hover:text-foreground cursor-pointer"
            >
              {t('signup.privacy')}
            </Link>
            {t('signup.suffix')}
          </p>
        </>
      }
    >
      <SignupForm />
    </AuthPageLayout>
  );
}

export default SignupPage;
