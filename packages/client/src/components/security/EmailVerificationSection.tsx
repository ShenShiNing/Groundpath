import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { VerificationCodeInput } from '@/components/auth/VerificationCodeInput';
import { Button } from '@/components/ui/button';
import type { EmailVerificationState } from './useEmailVerification';

interface EmailVerificationSectionProps {
  email: string | undefined;
  verification: EmailVerificationState;
  error: string | null;
}

export function EmailVerificationSection({
  email,
  verification,
  error,
}: EmailVerificationSectionProps) {
  const { t } = useTranslation('security');

  return (
    <div className="space-y-4 border-l-2 border-primary/20 pl-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">{t('password.setup.codeLabel')}</p>
        <p className="text-sm text-muted-foreground">
          {t('password.setup.codeHint', { email: email ?? '' })}
        </p>
        {verification.codeRemainingSeconds > 0 && (
          <p className="text-xs text-muted-foreground">
            {t('password.setup.codeExpiresIn', { seconds: verification.codeRemainingSeconds })}
          </p>
        )}
        {verification.verificationToken && verification.verificationRemainingSeconds > 0 && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            {t('password.setup.verifiedExpiresIn', {
              seconds: verification.verificationRemainingSeconds,
            })}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          className="cursor-pointer"
          onClick={() => void verification.handleSendCode()}
          disabled={verification.isSendingCode || verification.isVerifyingCode}
        >
          <KeyRound className="mr-1 size-4" />
          {verification.isSendingCode
            ? t('password.setup.sendingCode')
            : t('password.setup.sendCode')}
        </Button>
        {verification.resendCooldown > 0 && (
          <span className="text-xs text-muted-foreground">
            {t('password.setup.resendAfter', { seconds: verification.resendCooldown })}
          </span>
        )}
      </div>

      {verification.showVerificationSection && (
        <div className="space-y-4">
          <VerificationCodeInput
            value={verification.code}
            onChange={verification.handleCodeChange}
            disabled={verification.isVerifyingCode || verification.hasActiveVerification}
            autoFocus
            error={!!error}
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              onClick={() => void verification.handleVerifyCode(verification.code)}
              disabled={
                verification.code.length !== 6 ||
                verification.isVerifyingCode ||
                verification.hasActiveVerification
              }
            >
              {verification.isVerifyingCode
                ? t('password.setup.verifyingCode')
                : t('password.setup.verifyCode')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="cursor-pointer"
              onClick={() => void verification.handleSendCode()}
              disabled={verification.resendCooldown > 0 || verification.isSendingCode}
            >
              {t('password.setup.resend')}
            </Button>
          </div>

          {verification.verificationToken && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              {t('password.setup.verified')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
