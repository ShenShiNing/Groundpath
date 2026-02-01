import { Database, FileText, Layers, Settings } from 'lucide-react';
import type { KnowledgeBaseInfo } from '@knowledge-agent/shared/types';
import { Button } from '@/components/ui/button';
import { EmbeddingProviderBadge } from './EmbeddingProviderBadge';

interface KnowledgeBaseHeaderProps {
  knowledgeBase: KnowledgeBaseInfo;
  onEdit: () => void;
}

export function KnowledgeBaseHeader({ knowledgeBase, onEdit }: KnowledgeBaseHeaderProps) {
  return (
    <div className="border-b bg-background">
      <div className="container py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary mt-0.5">
              <Database className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{knowledgeBase.name}</h1>
                <EmbeddingProviderBadge provider={knowledgeBase.embeddingProvider} />
              </div>
              {knowledgeBase.description && (
                <p className="text-muted-foreground mt-1">{knowledgeBase.description}</p>
              )}
              <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <FileText className="size-4" />
                  <span>{knowledgeBase.documentCount} documents</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Layers className="size-4" />
                  <span>{knowledgeBase.totalChunks} chunks</span>
                </div>
                <span>
                  {knowledgeBase.embeddingModel} ({knowledgeBase.embeddingDimensions}d)
                </span>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Settings className="size-4 mr-1.5" />
            Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
