import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useForm } from '@tanstack/react-form';
import { Lock } from 'lucide-react';
import type { AxiosError } from 'axios';
import type { ApiResponse } from '@knowledge-agent/shared/types';
import { passwordSchema } from '@knowledge-agent/shared/schemas';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { authApi } from '@/api';
import { FormField } from '@/components/auth/FormField';
import { translateApiError } from '@/lib/http/translate-error';

interface PasswordStepProps {
  email: string;
  verificationToken: string;
  onBack: () => void;
}

export function PasswordStep({ email, verificationToken, onBack }: PasswordStepProps) {
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
        setError(translateApiError(axiosError));
      }
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
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
            if (!value) {
              return t('forgot.password.repeat');
            }

            const password = fieldApi.form.getFieldValue('newPassword');
            if (value !== password) {
              return t('forgot.password.mismatch');
            }

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
