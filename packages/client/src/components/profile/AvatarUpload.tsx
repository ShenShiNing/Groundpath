import { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import type { AxiosError } from 'axios';
import type { ApiResponse, UserPublicInfo } from '@groundpath/shared/types';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuthStore, useUserStore } from '@/stores';
import { translateApiError } from '@/lib/http/translate-error';

interface AvatarUploadProps {
  onUploadSuccess?: (user: UserPublicInfo) => void;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

export function AvatarUpload({ onUploadSuccess }: AvatarUploadProps) {
  const { t } = useTranslation('profile');
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { uploadAvatar, isUploadingAvatar } = useUserStore();
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userInitials = user?.username?.slice(0, 2).toUpperCase() ?? 'U';
  const displayUrl = previewUrl ?? user?.avatarUrl ?? undefined;

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return t('avatar.invalidType');
    }
    if (file.size > MAX_SIZE) {
      return t('avatar.tooLarge');
    }
    return null;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be selected again
    e.target.value = '';

    // Validate
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);

    // Show preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    try {
      const updatedUser = await uploadAvatar(file);
      setUser(updatedUser);
      onUploadSuccess?.(updatedUser);
    } catch (err) {
      const axiosError = err as AxiosError<ApiResponse>;
      setError(translateApiError(axiosError));
      // Revert preview on error
      setPreviewUrl(null);
    } finally {
      // Clean up object URL
      URL.revokeObjectURL(objectUrl);
      setPreviewUrl(null);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar className="size-20">
            <AvatarImage src={displayUrl} alt={t('avatar.alt')} />
            <AvatarFallback className="text-xl">{userInitials}</AvatarFallback>
          </Avatar>
          {isUploadingAvatar && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
              <Loader2 className="size-6 animate-spin text-white" />
            </div>
          )}
        </div>
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            onChange={handleFileChange}
            className="hidden"
            disabled={isUploadingAvatar}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClick}
            disabled={isUploadingAvatar}
          >
            <Upload className="mr-2 size-4" />
            {isUploadingAvatar ? t('avatar.uploading') : t('avatar.upload')}
          </Button>
          <p className="text-xs text-muted-foreground">{t('avatar.hint')}</p>
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
