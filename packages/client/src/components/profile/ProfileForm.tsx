import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { User, FileText } from 'lucide-react';
import type { AxiosError } from 'axios';
import type { ApiResponse, UserPublicInfo } from '@knowledge-agent/shared/types';
import { usernameSchema, bioSchema } from '@knowledge-agent/shared/schemas';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { FormField } from '@/components/auth/FormField';
import { useAuthStore, useUserStore } from '@/stores';
import { AvatarUpload } from './AvatarUpload';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/lib/http/translate-error';

interface ProfileFormProps {
  onSuccess?: (user: UserPublicInfo) => void;
}

export function ProfileForm({ onSuccess }: ProfileFormProps) {
  const { t } = useTranslation('profile');
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { updateProfile, isUpdatingProfile } = useUserStore();
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      username: user?.username ?? '',
      bio: user?.bio ?? '',
    },
    onSubmit: async ({ value }) => {
      setError(null);

      try {
        const updatedUser = await updateProfile({
          username: value.username,
          bio: value.bio || null,
        });
        setUser(updatedUser);
        onSuccess?.(updatedUser);
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
      className="space-y-6"
    >
      {/* Avatar Upload - separate from the form, uploads immediately */}
      <AvatarUpload />

      {/* Username Field */}
      <form.Field
        name="username"
        validators={{
          onBlur: ({ value }) => {
            const result = usernameSchema.safeParse(value);
            return result.success ? undefined : result.error.issues[0]?.message;
          },
        }}
      >
        {(field) => (
          <FormField
            name={field.name}
            label={t('form.username')}
            placeholder={t('form.usernamePlaceholder')}
            icon={User}
            value={field.state.value}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
            disabled={isUpdatingProfile}
            required
            errors={field.state.meta.errors as string[]}
            hint={t('form.usernameHint')}
          />
        )}
      </form.Field>

      {/* Bio Field */}
      <form.Field
        name="bio"
        validators={{
          onBlur: ({ value }) => {
            const result = bioSchema.safeParse(value);
            return result.success ? undefined : result.error.issues[0]?.message;
          },
        }}
      >
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor="bio">{t('form.bio')}</Label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Textarea
                id="bio"
                placeholder={t('form.bioPlaceholder')}
                className="min-h-24 pl-10 resize-none"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                disabled={isUpdatingProfile}
                maxLength={500}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{field.state.meta.errors[0]}</span>
              <span>{field.state.value.length}/500</span>
            </div>
          </div>
        )}
      </form.Field>

      {/* Error Message */}
      {error && <div className="text-sm text-destructive">{error}</div>}

      {/* Submit Button */}
      <Button type="submit" disabled={isUpdatingProfile}>
        {isUpdatingProfile ? t('form.saving') : t('form.save')}
      </Button>
    </form>
  );
}
