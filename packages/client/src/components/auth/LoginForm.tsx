import { useState } from 'react';
import { useRouter, Link } from '@tanstack/react-router';
import { useForm } from '@tanstack/react-form';
import { Mail, Lock } from 'lucide-react';
import type { AxiosError } from 'axios';
import type { ApiResponse } from '@knowledge-agent/shared/types';
import { emailSchema, loginRequestSchema } from '@knowledge-agent/shared/schemas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores';
import { initiateGitHubLogin, initiateGoogleLogin } from '@/api';
import { translateApiError } from '@/lib/http/translate-error';
import { FormField } from './FormField';
import { GitHubIcon, GoogleIcon } from './SocialIcons';

export function LoginForm() {
  const { t } = useTranslation(['auth', 'common']);
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm({
    defaultValues: {
      email: '',
      password: '',
    },
    onSubmit: async ({ value }) => {
      setError(null);

      // 提交前进行完整表单验证
      const validationResult = loginRequestSchema.safeParse(value);
      if (!validationResult.success) {
        const firstError = validationResult.error.issues[0];
        setError(firstError?.message || t('login.validationFailed'));
        return;
      }

      try {
        await login(value.email, value.password);
        await router.navigate({ to: '/dashboard' });
      } catch (err) {
        const axiosError = err as AxiosError<ApiResponse>;
        setError(translateApiError(axiosError));
      }
    },
  });

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{t('login.form.title')}</CardTitle>
        <CardDescription>{t('login.form.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          {/* Email Field */}
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

          {/* Password Field */}
          <form.Field
            name="password"
            validators={{
              onBlur: ({ value }) => (!value ? t('login.passwordRequired') : undefined),
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
                showPasswordToggle
                showPassword={showPassword}
                onTogglePassword={() => setShowPassword(!showPassword)}
              />
            )}
          </form.Field>

          {/* Forgot Password Link */}
          <div className="flex justify-end">
            <Link
              to="/auth/forgot-password"
              className="text-sm text-muted-foreground hover:text-primary cursor-pointer"
            >
              {t('login.forgotPassword')}
            </Link>
          </div>

          {/* Error Message */}
          {error && <div className="text-sm text-destructive">{error}</div>}

          {/* Submit Button & Social Login */}
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <>
                <Button type="submit" className="w-full cursor-pointer" disabled={isSubmitting}>
                  {isSubmitting ? t('login.submitting') : t('login.submit')}
                </Button>

                {/* Divider */}
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

                {/* Social Login Buttons */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="cursor-pointer"
                    disabled={isSubmitting}
                    onClick={() => initiateGitHubLogin()}
                  >
                    <GitHubIcon className="mr-2 h-4 w-4" />
                    GitHub
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="cursor-pointer"
                    disabled={isSubmitting}
                    onClick={() => initiateGoogleLogin()}
                  >
                    <GoogleIcon className="mr-2 h-4 w-4" />
                    Google
                  </Button>
                </div>
              </>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
    </Card>
  );
}
