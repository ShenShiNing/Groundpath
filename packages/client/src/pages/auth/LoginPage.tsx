import { LoginForm, AuthPageLayout, AuthFooterLink } from '@/components/auth';

export function LoginPage() {
  return (
    <AuthPageLayout
      title="Sign in to KnowledgeAgent"
      description="Enter your email below to access your account"
      footer={
        <AuthFooterLink text="Don't have an account?" linkText="Sign Up" linkTo="/auth/signup" />
      }
    >
      <LoginForm />
    </AuthPageLayout>
  );
}

export default LoginPage;
