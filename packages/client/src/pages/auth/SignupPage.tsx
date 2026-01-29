import { Link } from '@tanstack/react-router';
import { SignupForm, AuthPageLayout, AuthFooterLink } from '@/components/auth';

export function SignupPage() {
  return (
    <AuthPageLayout
      title="Create your account"
      description="Enter your details below to get started"
      footer={
        <>
          <AuthFooterLink text="Already have an account?" linkText="Sign In" linkTo="/auth/login" />
          <p className="text-center text-xs text-muted-foreground mt-4">
            By signing up, you agree to our{' '}
            <Link to="/" className="underline underline-offset-4 hover:text-foreground">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/" className="underline underline-offset-4 hover:text-foreground">
              Privacy Policy
            </Link>
            .
          </p>
        </>
      }
    >
      <SignupForm />
    </AuthPageLayout>
  );
}

export default SignupPage;
