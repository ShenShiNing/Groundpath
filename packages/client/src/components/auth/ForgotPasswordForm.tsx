import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, Link } from '@tanstack/react-router';
import { useForm } from '@tanstack/react-form';
import { Mail, Lock, ArrowLeft } from 'lucide-react';
import type { AxiosError } from 'axios';
import type { ApiResponse } from '@knowledge-agent/shared/types';
import { emailSchema, passwordSchema } from '@knowledge-agent/shared/schemas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { FormField } from './FormField';
import { VerificationCodeInput } from './VerificationCodeInput';
import { emailApi, authApi } from '@/api';

type ResetStep = 'email' | 'code' | 'password';

interface ResetState {
  email: string;
  verificationToken: string;
}

const RESEND_COOLDOWN = 60;

function StepIndicator({ currentStep }: { currentStep: ResetStep }) {
  const steps: ResetStep[] = ['email', 'code', 'password'];
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

function getStepTitle(step: ResetStep): string {
  switch (step) {
    case 'email':
      return 'forgot.step.email.title';
    case 'code':
      return 'forgot.step.code.title';
    case 'password':
      return 'forgot.step.password.title';
  }
}

function getStepDescription(step: ResetStep): string {
  switch (step) {
    case 'email':
      return 'forgot.step.email.description';
    case 'code':
      return 'forgot.step.code.description';
    case 'password':
      return 'forgot.step.password.description';
  }
}

// Step 1: Email Input
function EmailStep({
  onNext,
  defaultEmail,
}: {
  onNext: (email: string) => void;
  defaultEmail: string;
}) {
  const { t } = useTranslation(['auth', 'common']);
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { email: defaultEmail },
    onSubmit: async ({ value }) => {
      setError(null);
      const result = emailSchema.safeParse(value.email);
      if (!result.success) {
        setError(result.error.issues[0]?.message || t('forgot.email.invalid'));
        return;
      }

      try {
        await emailApi.sendCode({ email: value.email, type: 'reset_password' });
        onNext(value.email);
      } catch (err) {
        const axiosError = err as AxiosError<ApiResponse>;
        setError(axiosError.response?.data?.error?.message || t('forgot.email.sendFailed'));
      }
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="space-y-4"
    >
      <form.Field
        name="email"
        validators={{
          onBlur: ({ value }) => {
            const result = emailSchema.safeParse(value);
            return result.success ? undefined : result.error.issues[0]?.message;
          },
        }}
      >
        {(field) => (
          <FormField
            name={field.name}
            label={t('common:email')}
            type="email"
            placeholder="name@example.com"
            icon={Mail}
            value={field.state.value}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
            disabled={form.state.isSubmitting}
            required
            errors={field.state.meta.errors as string[]}
          />
        )}
      </form.Field>

      {error && <div className="text-sm text-destructive">{error}</div>}

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" className="w-full cursor-pointer" disabled={isSubmitting}>
            {isSubmitting ? t('forgot.email.sending') : t('forgot.email.sendCode')}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

// Step 2: Code Verification
function CodeStep({
  email,
  onNext,
  onBack,
}: {
  email: string;
  onNext: (token: string) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation(['auth', 'common']);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
  const hasAutoVerified = useRef(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleVerify = useCallback(
    async (codeToVerify: string) => {
      if (codeToVerify.length !== 6) {
        setError(t('forgot.code.invalidLength'));
        return;
      }

      setError(null);
      setIsVerifying(true);

      try {
        const result = await emailApi.verifyCode({
          email,
          code: codeToVerify,
          type: 'reset_password',
        });
        onNext(result.verificationToken);
      } catch (err) {
        const axiosError = err as AxiosError<ApiResponse>;
        setError(axiosError.response?.data?.error?.message || t('forgot.code.invalid'));
        // Reset auto-verify flag on error so user can try again
        hasAutoVerified.current = false;
      } finally {
        setIsVerifying(false);
      }
    },
    [email, onNext, t]
  );

  // Handle code change with auto-verify
  const handleCodeChange = useCallback(
    (newCode: string) => {
      setCode(newCode);
      // Auto-verify when 6 digits are entered (only once per complete input)
      if (newCode.length === 6 && !hasAutoVerified.current && !isVerifying) {
        hasAutoVerified.current = true;
        handleVerify(newCode);
      } else if (newCode.length < 6) {
        // Reset flag when code is incomplete
        hasAutoVerified.current = false;
      }
    },
    [handleVerify, isVerifying]
  );

  const handleResend = async () => {
    setError(null);
    setIsResending(true);
    try {
      await emailApi.sendCode({ email, type: 'reset_password' });
      setResendCooldown(RESEND_COOLDOWN);
      setCode('');
      hasAutoVerified.current = false;
    } catch (err) {
      const axiosError = err as AxiosError<ApiResponse>;
      setError(axiosError.response?.data?.error?.message || t('forgot.code.resendFailed'));
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <p className="text-sm text-muted-foreground">{t('forgot.code.sentTo')}</p>
        <p className="font-medium">{email}</p>
      </div>

      <div className="space-y-4">
        <VerificationCodeInput
          value={code}
          onChange={handleCodeChange}
          disabled={isVerifying}
          autoFocus
          error={!!error}
        />
        {error && <div className="text-sm text-destructive text-center">{error}</div>}
      </div>

      <div className="space-y-3">
        <Button
          type="button"
          className="w-full cursor-pointer"
          onClick={() => handleVerify(code)}
          disabled={code.length !== 6 || isVerifying}
        >
          {isVerifying ? t('forgot.code.verifying') : t('forgot.code.verify')}
        </Button>

        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="cursor-pointer"
            onClick={onBack}
          >
            {t('common:back')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="cursor-pointer"
            onClick={handleResend}
            disabled={resendCooldown > 0 || isResending}
          >
            {isResending
              ? t('forgot.email.sending')
              : resendCooldown > 0
                ? t('forgot.code.resendAfter', { seconds: resendCooldown })
                : t('forgot.code.resend')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Step 3: New Password
function PasswordStep({
  email,
  verificationToken,
  onBack,
}: {
  email: string;
  verificationToken: string;
  onBack: () => void;
}) {
  const { t } = useTranslation(['auth', 'common']);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const form = useForm({
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
    onSubmit: async ({ value }) => {
      setError(null);

      try {
        await authApi.resetPassword({
          email,
          newPassword: value.newPassword,
          confirmPassword: value.confirmPassword,
          verificationToken,
          logoutAllDevices: true,
        });
        await router.navigate({ to: '/auth/login' });
      } catch (err) {
        const axiosError = err as AxiosError<ApiResponse>;
        setError(axiosError.response?.data?.error?.message || t('forgot.password.failed'));
      }
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="space-y-4"
    >
      <form.Field
        name="newPassword"
        validators={{
          onBlur: ({ value }) => {
            const result = passwordSchema.safeParse(value);
            return result.success ? undefined : result.error.issues[0]?.message;
          },
        }}
      >
        {(field) => (
          <FormField
            name={field.name}
            label={t('forgot.password.new')}
            placeholder="••••••••"
            icon={Lock}
            value={field.state.value}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
            disabled={form.state.isSubmitting}
            required
            errors={field.state.meta.errors as string[]}
            hint={t('forgot.password.hint')}
            showPasswordToggle
            showPassword={showPassword}
            onTogglePassword={() => setShowPassword(!showPassword)}
          />
        )}
      </form.Field>

      <form.Field
        name="confirmPassword"
        validators={{
          onChangeListenTo: ['newPassword'],
          onChange: ({ value, fieldApi }) => {
            if (!value) return t('forgot.password.repeat');
            const password = fieldApi.form.getFieldValue('newPassword');
            if (value !== password) return t('forgot.password.mismatch');
            return undefined;
          },
        }}
      >
        {(field) => (
          <FormField
            name={field.name}
            label={t('forgot.password.confirmNew')}
            placeholder="••••••••"
            icon={Lock}
            value={field.state.value}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
            disabled={form.state.isSubmitting}
            required
            errors={field.state.meta.errors as string[]}
            showPasswordToggle
            showPassword={showConfirmPassword}
            onTogglePassword={() => setShowConfirmPassword(!showConfirmPassword)}
          />
        )}
      </form.Field>

      {error && <div className="text-sm text-destructive">{error}</div>}

      <div className="space-y-3">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" className="w-full cursor-pointer" disabled={isSubmitting}>
              {isSubmitting ? t('forgot.password.submitting') : t('forgot.password.submit')}
            </Button>
          )}
        </form.Subscribe>

        <div className="flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="cursor-pointer"
            onClick={onBack}
          >
            {t('common:back')}
          </Button>
        </div>
      </div>
    </form>
  );
}

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
