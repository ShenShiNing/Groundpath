import { useForm } from '@tanstack/react-form';
import { Folder } from 'lucide-react';
import { toast } from 'sonner';
import type { FolderInfo } from '@knowledge-agent/shared/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useKBFolders, useCreateFolderInKB, useUpdateFolder } from '@/hooks';
import { useTranslation } from 'react-i18next';

interface FolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder?: FolderInfo;
  parentId?: string | null;
  knowledgeBaseId?: string;
}

export function FolderDialog({
  open,
  onOpenChange,
  folder,
  parentId,
  knowledgeBaseId,
}: FolderDialogProps) {
  const { t } = useTranslation(['document', 'common']);
  // Use KB-specific folder list when knowledgeBaseId is provided
  const effectiveKbId = knowledgeBaseId ?? folder?.knowledgeBaseId;
  const { data: folders = [] } = useKBFolders(effectiveKbId);
  const createMutation = useCreateFolderInKB();
  const updateMutation = useUpdateFolder();

  const isEditing = !!folder;
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const form = useForm({
    defaultValues: {
      name: folder?.name ?? '',
      parentId: folder?.parentId ?? parentId ?? null,
    },
    onSubmit: async ({ value }) => {
      try {
        if (isEditing) {
          await updateMutation.mutateAsync({
            id: folder.id,
            data: {
              name: value.name,
              parentId: value.parentId,
            },
          });
          toast.success(t('folder.toast.updated'));
        } else {
          if (!effectiveKbId) {
            toast.error(t('folder.toast.kbIdRequired'));
            return;
          }
          await createMutation.mutateAsync({
            kbId: effectiveKbId,
            data: {
              name: value.name,
              parentId: value.parentId,
            },
          });
          toast.success(t('folder.toast.created'));
        }
        onOpenChange(false);
      } catch {
        toast.error(isEditing ? t('folder.toast.updateFailed') : t('folder.toast.createFailed'));
      }
    },
  });

  // Build flat list of folders for parent selection (excluding current folder and its descendants)
  const availableParents = folders.filter((f) => {
    if (!isEditing) return true;
    // Exclude the folder being edited and its descendants
    if (f.id === folder?.id) return false;
    if (f.path.includes(`/${folder?.id}/`)) return false;
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Folder className="h-5 w-5" />
            {isEditing ? t('folder.dialog.editTitle') : t('folder.dialog.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? t('folder.dialog.editDescription') : t('folder.dialog.createDescription')}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field name="name">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="name">{t('folder.form.name')}</Label>
                <Input
                  id="name"
                  placeholder={t('folder.form.namePlaceholder')}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            )}
          </form.Field>

          <form.Field name="parentId">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="parentId">{t('folder.form.parentFolder')}</Label>
                <Select
                  value={field.state.value ?? 'root'}
                  onValueChange={(value) => field.handleChange(value === 'root' ? null : value)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('folder.form.parentPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="root">{t('folder.form.root')}</SelectItem>
                    {availableParents.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t('cancel', { ns: 'common' })}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? isEditing
                  ? t('folder.form.updating')
                  : t('folder.form.creating')
                : isEditing
                  ? t('folder.form.update')
                  : t('folder.form.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
