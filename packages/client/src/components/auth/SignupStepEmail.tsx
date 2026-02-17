import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { Mail } from 'lucide-react';
import type { AxiosError } from 'axios';
import type { ApiResponse } from '@knowledge-agent/shared/types';
import { emailSchema } from '@knowledge-agent/shared/schemas';
import { Button } from '@/components/ui/button';
import { FormField } from './FormField';
import { emailApi } from '@/api/email';

interface SignupStepEmailProps {
  onNext: (email: string) => void;
  defaultEmail?: string;
}

export function SignupStepEmail({ onNext, defaultEmail = '' }: SignupStepEmailProps) {
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      email: defaultEmail,
    },
    onSubmit: async ({ value }) => {
      setError(null);

      const result = emailSchema.safeParse(value.email);
      if (!result.success) {
        setError(result.error.issues[0]?.message || '邮箱格式不正确');
        return;
      }

      try {
        await emailApi.sendCode({ email: value.email, type: 'register' });
        onNext(value.email);
      } catch (err) {
        const axiosError = err as AxiosError<ApiResponse>;
        setError(axiosError.response?.data?.error?.message || '验证码发送失败');
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
        <p className="text-sm text-muted-foreground">
          输入你的邮箱地址，我们会发送验证码到该邮箱。
        </p>
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
            label="邮箱"
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
            {isSubmitting ? '发送中...' : '发送验证码'}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
