import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { Mail } from 'lucide-react';
import type { AxiosError } from 'axios';
import type { ApiResponse } from '@groundpath/shared/types';
import { emailSchema } from '@groundpath/shared/schemas';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { FormField } from './FormField';
import { emailApi } from '@/api';
import { translateApiError } from '@/lib/http/translate-error';

interface SignupStepEmailProps {
  onNext: (email: string) => void;
  defaultEmail?: string;
}

export function SignupStepEmail({ onNext, defaultEmail = '' }: SignupStepEmailProps) {
  const { t } = useTranslation(['auth', 'common']);
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      email: defaultEmail,
    },
    onSubmit: async ({ value }) => {
      setError(null);

      const result = emailSchema.safeParse(value.email);
      if (!result.success) {
        setError(result.error.issues[0]?.message || t('signup.email.invalid'));
        return;
      }

      try {
        await emailApi.sendCode({ email: value.email, type: 'register' });
        onNext(value.email);
      } catch (err) {
        const axiosError = err as AxiosError<ApiResponse>;
        setError(translateApiError(axiosError));
      }
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      className="space-y-4"
    >
      <div className="text-center space-y-1">
        <p className="text-sm text-muted-foreground">{t('signup.email.helper')}</p>
      </div>

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
            {isSubmitting ? t('signup.email.sending') : t('signup.email.sendCode')}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
