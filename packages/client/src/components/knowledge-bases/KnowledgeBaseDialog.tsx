import { useState } from 'react';
import type {
  KnowledgeBaseInfo,
  KnowledgeBaseListItem,
  EmbeddingProviderType,
} from '@groundpath/shared/types';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateKnowledgeBase, useUpdateKnowledgeBase } from '@/hooks';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

type EditableKnowledgeBase = KnowledgeBaseInfo | KnowledgeBaseListItem;

interface KnowledgeBaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  knowledgeBase?: EditableKnowledgeBase;
}

interface FormContentProps {
  knowledgeBase?: EditableKnowledgeBase;
  onOpenChange: (open: boolean) => void;
}

function FormContent({ knowledgeBase, onOpenChange }: FormContentProps) {
  const { t } = useTranslation(['knowledgeBase', 'common']);
  const isEditing = !!knowledgeBase;
  const [name, setName] = useState(knowledgeBase?.name ?? '');
  const [description, setDescription] = useState(knowledgeBase?.description ?? '');
  const [embeddingProvider, setEmbeddingProvider] = useState<EmbeddingProviderType>(
    knowledgeBase?.embeddingProvider ?? 'zhipu'
  );

  const createMutation = useCreateKnowledgeBase();
  const updateMutation = useUpdateKnowledgeBase();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          id: knowledgeBase.id,
          data: {
            name: name.trim(),
            description: description.trim() || null,
          },
        });
        toast.success(t('dialog.toast.updated'));
      } else {
        await createMutation.mutateAsync({
          name: name.trim(),
          description: description.trim() || null,
          embeddingProvider,
        });
        toast.success(t('dialog.toast.created'));
      }
      onOpenChange(false);
    } catch {
      toast.error(isEditing ? t('dialog.toast.updateFailed') : t('dialog.toast.createFailed'));
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{isEditing ? t('dialog.editTitle') : t('dialog.createTitle')}</DialogTitle>
        <DialogDescription>
          {isEditing ? t('dialog.editDescription') : t('dialog.createDescription')}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="name">{t('dialog.name')}</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('dialog.namePlaceholder')}
            maxLength={200}
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="description">{t('dialog.description')}</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('dialog.descriptionPlaceholder')}
            maxLength={2000}
            rows={3}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="provider">{t('dialog.embeddingProvider')}</Label>
          <Select
            value={embeddingProvider}
            onValueChange={(v) => setEmbeddingProvider(v as EmbeddingProviderType)}
            disabled={isEditing}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zhipu">{t('dialog.providerZhipu')}</SelectItem>
              <SelectItem value="openai">{t('dialog.providerOpenAI')}</SelectItem>
              <SelectItem value="ollama">{t('dialog.providerOllama')}</SelectItem>
            </SelectContent>
          </Select>
          {isEditing && <p className="text-xs text-muted-foreground">{t('dialog.providerNote')}</p>}
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          {t('cancel', { ns: 'common' })}
        </Button>
        <Button type="submit" disabled={isPending || !name.trim()}>
          {isPending
            ? isEditing
              ? t('dialog.updating')
              : t('dialog.creating')
            : isEditing
              ? t('update', { ns: 'common' })
              : t('create', { ns: 'common' })}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function KnowledgeBaseDialog({
  open,
  onOpenChange,
  knowledgeBase,
}: KnowledgeBaseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-106.25">
        {/* Using key to reset form state when dialog opens or knowledgeBase changes */}
        {open && (
          <FormContent
            key={knowledgeBase?.id ?? 'new'}
            knowledgeBase={knowledgeBase}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
