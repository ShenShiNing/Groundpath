import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { cn } from '@/lib/utils';

interface VerificationCodeInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  error?: boolean;
}

export function VerificationCodeInput({
  length = 6,
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  error = false,
}: VerificationCodeInputProps) {
  return (
    <InputOTP
      maxLength={length}
      value={value}
      onChange={onChange}
      disabled={disabled}
      autoFocus={autoFocus}
      pattern={REGEXP_ONLY_DIGITS}
      containerClassName="justify-center"
    >
      <InputOTPGroup>
        {Array.from({ length }, (_, index) => (
          <InputOTPSlot
            key={index}
            index={index}
            className={cn(
              'h-11 w-10 text-lg font-semibold sm:h-12 sm:w-12 sm:text-xl',
              error && 'border-destructive'
            )}
          />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
