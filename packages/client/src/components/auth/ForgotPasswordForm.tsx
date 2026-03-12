import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { CodeStep } from './forgot-password/CodeStep';
import { EmailStep } from './forgot-password/EmailStep';
import { PasswordStep } from './forgot-password/PasswordStep';
import { StepIndicator } from './forgot-password/StepIndicator';
import {
  getStepDescription,
  getStepTitle,
  type ResetState,
  type ResetStep,
} from './forgot-password/types';

export function ForgotPasswordForm() {
  const { t } = useTranslation(['auth', 'common']);
  const [step, setStep] = useState<ResetStep>('email');
  const [resetState, setResetState] = useState<ResetState>({
    email: '',
    verificationToken: '',
  });

  const handleEmailSubmit = (email: string) => {
    setResetState((prev) => ({ ...prev, email }));
    setStep('code');
  };

  const handleCodeVerified = (verificationToken: string) => {
    setResetState((prev) => ({ ...prev, verificationToken }));
    setStep('password');
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
            <EmailStep onNext={handleEmailSubmit} defaultEmail={resetState.email} />
            <div className="mt-4 text-center">
              <Link
                to="/auth/login"
                className="inline-flex items-center text-sm text-muted-foreground hover:text-primary cursor-pointer"
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                {t('forgot.backToLogin')}
              </Link>
            </div>
          </>
        )}

        {step === 'code' && (
          <CodeStep
            email={resetState.email}
            onNext={handleCodeVerified}
            onBack={() => setStep('email')}
          />
        )}

        {step === 'password' && (
          <PasswordStep
            email={resetState.email}
            verificationToken={resetState.verificationToken}
            onBack={() => setStep('code')}
          />
        )}
      </CardContent>
    </Card>
  );
}
