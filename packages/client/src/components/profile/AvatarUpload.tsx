import { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import type { AxiosError } from 'axios';
import type { ApiResponse, UserPublicInfo } from '@knowledge-agent/shared/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuthStore, useUserStore } from '@/stores';

interface AvatarUploadProps {
  onUploadSuccess?: (user: UserPublicInfo) => void;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

export function AvatarUpload({ onUploadSuccess }: AvatarUploadProps) {
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
      return 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP';
    }
    if (file.size > MAX_SIZE) {
      return 'File too large. Maximum size is 2MB';
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
      const errorMessage = axiosError.response?.data?.error?.message || 'Failed to upload avatar';
      setError(errorMessage);
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
            <AvatarImage src={displayUrl} alt="Avatar" />
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
            {isUploadingAvatar ? 'Uploading...' : 'Upload Avatar'}
          </Button>
          <p className="text-xs text-muted-foreground">JPEG, PNG, GIF or WebP. Max 2MB.</p>
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
