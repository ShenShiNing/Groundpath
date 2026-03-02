import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { initiateGitHubLogin, initiateGoogleLogin } from '@/api';
import { SignupStepEmail } from './SignupStepEmail';
import { SignupStepCode } from './SignupStepCode';
import { SignupStepDetails } from './SignupStepDetails';
import { GitHubIcon, GoogleIcon } from './SocialIcons';

type SignupStep = 'email' | 'code' | 'details';

interface SignupState {
  email: string;
  verificationToken: string;
}

function StepIndicator({ currentStep }: { currentStep: SignupStep }) {
  const steps: SignupStep[] = ['email', 'code', 'details'];
  const currentIndex = steps.indexOf(currentStep);

  return (
    <div className="flex items-center justify-center gap-2 mb-4">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center">
          <div
            className={`w-2 h-2 rounded-full transition-colors ${
              index <= currentIndex ? 'bg-primary' : 'bg-muted'
            }`}
          />
          {index < steps.length - 1 && (
            <div
              className={`w-8 h-0.5 transition-colors ${
                index < currentIndex ? 'bg-primary' : 'bg-muted'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function getStepTitle(step: SignupStep): string {
  switch (step) {
    case 'email':
      return 'signup.step.email.title';
    case 'code':
      return 'signup.step.code.title';
    case 'details':
      return 'signup.step.details.title';
  }
}

function getStepDescription(step: SignupStep): string {
  switch (step) {
    case 'email':
      return 'signup.step.email.description';
    case 'code':
      return 'signup.step.code.description';
    case 'details':
      return 'signup.step.details.description';
  }
}

export function SignupForm() {
  const { t } = useTranslation(['auth', 'common']);
  const router = useRouter();
  const registerWithCode = useAuthStore((state) => state.registerWithCode);
  const [step, setStep] = useState<SignupStep>('email');
  const [signupState, setSignupState] = useState<SignupState>({
    email: '',
    verificationToken: '',
  });

  const handleEmailSubmit = (email: string) => {
    setSignupState((prev) => ({ ...prev, email }));
    setStep('code');
  };

  const handleCodeVerified = (verificationToken: string) => {
    setSignupState((prev) => ({ ...prev, verificationToken }));
    setStep('details');
  };

  const handleDetailsSubmit = async (data: {
    username: string;
    password: string;
    confirmPassword: string;
  }) => {
    await registerWithCode({
      email: signupState.email,
      username: data.username,
      password: data.password,
      confirmPassword: data.confirmPassword,
      verificationToken: signupState.verificationToken,
    });
    await router.navigate({ to: '/dashboard' });
  };

  const handleBackToEmail = () => {
    setStep('email');
  };

  const handleBackToCode = () => {
    setStep('code');
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <StepIndicator currentStep={step} />
        <CardTitle className="text-xl">{t(getStepTitle(step))}</CardTitle>
        <CardDescription>{t(getStepDescription(step))}</CardDescription>
      </CardHeader>
      <CardContent>
        {step === 'email' && (
          <>
            <SignupStepEmail onNext={handleEmailSubmit} defaultEmail={signupState.email} />

            {/* Social Login - only show on first step */}
            <div className="mt-4">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    {t('common:orContinueWith')}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => initiateGitHubLogin()}
                >
                  <GitHubIcon className="mr-2 h-4 w-4" />
                  GitHub
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => initiateGoogleLogin()}
                >
                  <GoogleIcon className="mr-2 h-4 w-4" />
                  Google
                </Button>
              </div>
            </div>
          </>
        )}

        {step === 'code' && (
          <SignupStepCode
            email={signupState.email}
            onNext={handleCodeVerified}
            onBack={handleBackToEmail}
          />
        )}

        {step === 'details' && (
          <SignupStepDetails
            email={signupState.email}
            onSubmit={handleDetailsSubmit}
            onBack={handleBackToCode}
          />
        )}
      </CardContent>
    </Card>
  );
}
