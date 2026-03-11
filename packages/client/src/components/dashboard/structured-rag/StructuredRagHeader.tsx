import { startTransition } from 'react';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface StructuredRagHeaderProps {
  hours: number;
  knowledgeBaseId: string;
  knowledgeBases: Array<{ id: string; name: string }>;
  windowHours: number;
  isExporting: boolean;
  onHoursChange: (hours: number) => void;
  onKnowledgeBaseChange: (knowledgeBaseId: string) => void;
  onExport: () => void;
}

export function StructuredRagHeader({
  hours,
  knowledgeBaseId,
  knowledgeBases,
  windowHours,
  isExporting,
  onHoursChange,
  onKnowledgeBaseChange,
  onExport,
}: StructuredRagHeaderProps) {
  const { t } = useTranslation('dashboard');

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h3 className="text-lg font-semibold">{t('structuredRag.title')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('structuredRag.subtitle', { hours: windowHours })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={String(hours)}
          onValueChange={(value) => {
            startTransition(() => {
              onHoursChange(Number(value));
            });
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="6">{t('structuredRag.filters.lastHours', { hours: 6 })}</SelectItem>
            <SelectItem value="24">
              {t('structuredRag.filters.lastHours', { hours: 24 })}
            </SelectItem>
            <SelectItem value="72">
              {t('structuredRag.filters.lastHours', { hours: 72 })}
            </SelectItem>
            <SelectItem value="168">
              {t('structuredRag.filters.lastHours', { hours: 168 })}
            </SelectItem>
            <SelectItem value="720">
              {t('structuredRag.filters.lastHours', { hours: 720 })}
            </SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={knowledgeBaseId}
          onValueChange={(value) => {
            startTransition(() => {
              onKnowledgeBaseChange(value);
            });
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t('structuredRag.filters.allKnowledgeBases')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('structuredRag.filters.allKnowledgeBases')}</SelectItem>
            {knowledgeBases.map((knowledgeBase) => (
              <SelectItem key={knowledgeBase.id} value={knowledgeBase.id}>
                {knowledgeBase.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Badge variant="secondary">{t('structuredRag.window', { hours: windowHours })}</Badge>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="cursor-pointer"
          disabled={isExporting}
          onClick={onExport}
        >
          <Download className="mr-1 size-3.5" />
          {t('structuredRag.report.download')}
        </Button>
      </div>
    </div>
  );
}
