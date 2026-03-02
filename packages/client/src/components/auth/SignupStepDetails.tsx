import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { User, Lock } from 'lucide-react';
import type { AxiosError } from 'axios';
import type { ApiResponse } from '@knowledge-agent/shared/types';
import { usernameSchema, passwordSchema } from '@knowledge-agent/shared/schemas';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { FormField } from './FormField';

interface SignupStepDetailsProps {
  email: string;
  onSubmit: (data: {
    username: string;
    password: string;
    confirmPassword: string;
  }) => Promise<void>;
  onBack: () => void;
}

export function SignupStepDetails({ email, onSubmit, onBack }: SignupStepDetailsProps) {
  const { t } = useTranslation(['auth', 'common']);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const form = useForm({
    defaultValues: {
      username: '',
      password: '',
      confirmPassword: '',
    },
    onSubmit: async ({ value }) => {
      setError(null);

      try {
        await onSubmit(value);
      } catch (err) {
        const axiosError = err as AxiosError<ApiResponse>;
        setError(axiosError.response?.data?.error?.message || t('signup.details.failed'));
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
        <p className="text-sm text-muted-foreground">{t('signup.details.setupFor', { email })}</p>
      </div>

      {/* Username Field */}
      <form.Field
        name="username"
        validators={{
          onBlur: ({ value }) => {
            if (!value) return undefined;
            const result = usernameSchema.safeParse(value);
            return result.success ? undefined : result.error.issues[0]?.message;
          },
        }}
      >
        {(field) => (
          <FormField
            name={field.name}
            label={t('common:username')}
            type="text"
            placeholder="zhangsan"
            icon={User}
            value={field.state.value}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
            disabled={form.state.isSubmitting}
            required
            errors={field.state.meta.errors as string[]}
          />
        )}
      </form.Field>

      {/* Password Field */}
      <form.Field
        name="password"
        validators={{
          onBlur: ({ value }) => {
            if (!value) return undefined;
            const result = passwordSchema.safeParse(value);
            return result.success ? undefined : result.error.issues[0]?.message;
          },
        }}
      >
        {(field) => (
          <FormField
            name={field.name}
            label={t('common:password')}
            placeholder="••••••••"
            icon={Lock}
            value={field.state.value}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
            disabled={form.state.isSubmitting}
            required
            errors={field.state.meta.errors as string[]}
            hint={t('signup.details.passwordHint')}
            showPasswordToggle
            showPassword={showPassword}
            onTogglePassword={() => setShowPassword(!showPassword)}
          />
        )}
      </form.Field>

      {/* Confirm Password Field */}
      <form.Field
        name="confirmPassword"
        validators={{
          onBlur: ({ value, fieldApi }) => {
            if (!value) return undefined;
            const password = fieldApi.form.getFieldValue('password');
            if (value !== password) return t('signup.details.passwordMismatch');
            return undefined;
          },
        }}
      >
        {(field) => (
          <FormField
            name={field.name}
            label={t('common:confirmPassword')}
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
              {isSubmitting ? t('signup.details.creating') : t('signup.details.createAccount')}
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
