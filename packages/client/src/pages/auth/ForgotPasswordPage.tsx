import { ForgotPasswordForm, AuthPageLayout, AuthFooterLink } from '@/components/auth';

export function ForgotPasswordPage() {
  return (
    <AuthPageLayout
      title="Forgot your password?"
      description="No worries, we'll help you reset it"
      footer={
        <AuthFooterLink text="Remember your password?" linkText="Sign In" linkTo="/auth/login" />
      }
    >
      <ForgotPasswordForm />
    </AuthPageLayout>
  );
}

export default ForgotPasswordPage;
