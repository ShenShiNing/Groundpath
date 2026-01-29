import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type KeyboardEvent,
  type ClipboardEvent,
} from 'react';
import { Input } from '@/components/ui/input';
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
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  // Split value into individual characters
  const digits = value.split('').slice(0, length);

  // Focus first empty input on mount if autoFocus
  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  const focusInput = useCallback(
    (index: number) => {
      if (index >= 0 && index < length && inputRefs.current[index]) {
        inputRefs.current[index]?.focus();
      }
    },
    [length]
  );

  const handleChange = useCallback(
    (index: number, newValue: string) => {
      // Only allow digits
      const digit = newValue.replace(/\D/g, '').slice(-1);

      if (digit) {
        // Update value
        const newDigits = [...digits];
        newDigits[index] = digit;

        // Pad with empty strings up to current index if needed
        while (newDigits.length <= index) {
          newDigits.push('');
        }

        onChange(newDigits.join(''));

        // Move to next input
        if (index < length - 1) {
          focusInput(index + 1);
        }
      }
    },
    [digits, onChange, length, focusInput]
  );

  const handleKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace') {
        e.preventDefault();

        if (digits[index]) {
          // Clear current digit
          const newDigits = [...digits];
          newDigits[index] = '';
          onChange(newDigits.join(''));
        } else if (index > 0) {
          // Move to previous input and clear it
          const newDigits = [...digits];
          newDigits[index - 1] = '';
          onChange(newDigits.join(''));
          focusInput(index - 1);
        }
      } else if (e.key === 'ArrowLeft' && index > 0) {
        e.preventDefault();
        focusInput(index - 1);
      } else if (e.key === 'ArrowRight' && index < length - 1) {
        e.preventDefault();
        focusInput(index + 1);
      }
    },
    [digits, onChange, length, focusInput]
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pastedData = e.clipboardData.getData('text/plain');
      const pastedDigits = pastedData.replace(/\D/g, '').slice(0, length);

      if (pastedDigits) {
        onChange(pastedDigits);
        // Focus the next empty input or the last one
        const nextIndex = Math.min(pastedDigits.length, length - 1);
        focusInput(nextIndex);
      }
    },
    [length, onChange, focusInput]
  );

  const handleFocus = useCallback((index: number) => {
    setFocusedIndex(index);
  }, []);

  const handleBlur = useCallback(() => {
    setFocusedIndex(null);
  }, []);

  return (
    <div className="flex justify-center gap-2">
      {Array.from({ length }, (_, index) => (
        <Input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[index] || ''}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={() => handleFocus(index)}
          onBlur={handleBlur}
          disabled={disabled}
          className={cn(
            'h-12 w-12 text-center text-xl font-semibold',
            'transition-all duration-150',
            focusedIndex === index && 'ring-2 ring-primary ring-offset-2',
            error && 'border-destructive focus-visible:ring-destructive'
          )}
          aria-label={`Digit ${index + 1}`}
        />
      ))}
    </div>
  );
}
