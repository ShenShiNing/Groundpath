import { useState } from 'react';
import type {
  KnowledgeBaseInfo,
  KnowledgeBaseListItem,
  EmbeddingProviderType,
} from '@knowledge-agent/shared/types';
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
        toast.success('Knowledge base updated');
      } else {
        await createMutation.mutateAsync({
          name: name.trim(),
          description: description.trim() || null,
          embeddingProvider,
        });
        toast.success('Knowledge base created');
      }
      onOpenChange(false);
    } catch {
      toast.error(
        isEditing ? 'Failed to update knowledge base' : 'Failed to create knowledge base'
      );
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{isEditing ? 'Edit Knowledge Base' : 'Create Knowledge Base'}</DialogTitle>
        <DialogDescription>
          {isEditing
            ? 'Update the name and description. Embedding configuration cannot be changed.'
            : 'Create a new knowledge base with an embedding provider.'}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Knowledge Base"
            maxLength={200}
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description..."
            maxLength={2000}
            rows={3}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="provider">Embedding Provider</Label>
          <Select
            value={embeddingProvider}
            onValueChange={(v) => setEmbeddingProvider(v as EmbeddingProviderType)}
            disabled={isEditing}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zhipu">Zhipu AI</SelectItem>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="ollama">Ollama (Local)</SelectItem>
            </SelectContent>
          </Select>
          {isEditing && (
            <p className="text-xs text-muted-foreground">
              Embedding provider cannot be changed after creation.
            </p>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending || !name.trim()}>
          {isPending
            ? isEditing
              ? 'Updating...'
              : 'Creating...'
            : isEditing
              ? 'Update'
              : 'Create'}
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
