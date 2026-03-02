import { ForgotPasswordForm, AuthPageLayout, AuthFooterLink } from '@/components/auth';
import { useTranslation } from 'react-i18next';

export function ForgotPasswordPage() {
  const { t } = useTranslation('auth');

  return (
    <AuthPageLayout
      title={t('forgot.pageTitle')}
      description={t('forgot.pageDescription')}
      footer={
        <AuthFooterLink
          text={t('forgot.footerText')}
          linkText={t('forgot.footerLink')}
          linkTo="/auth/login"
        />
      }
    >
      <ForgotPasswordForm />
    </AuthPageLayout>
  );
}

export default ForgotPasswordPage;
