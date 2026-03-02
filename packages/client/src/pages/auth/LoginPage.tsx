import { LoginForm, AuthPageLayout, AuthFooterLink } from '@/components/auth';
import { useTranslation } from 'react-i18next';

export function LoginPage() {
  const { t } = useTranslation('auth');

  return (
    <AuthPageLayout
      title={t('login.pageTitle')}
      description={t('login.pageDescription')}
      footer={
        <AuthFooterLink
          text={t('login.footerText')}
          linkText={t('login.footerLink')}
          linkTo="/auth/signup"
        />
      }
    >
      <LoginForm />
    </AuthPageLayout>
  );
}

export default LoginPage;
