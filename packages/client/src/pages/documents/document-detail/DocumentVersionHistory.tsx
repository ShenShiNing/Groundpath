import type { DocumentVersionListItem, VersionSource } from '@groundpath/shared/types';
import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/date';
import { formatBytes } from '@/lib/utils';

const versionSourceTranslationKeys = {
  upload: 'versions.source.upload',
  edit: 'versions.source.edit',
  ai_generate: 'versions.source.ai_generate',
  restore: 'versions.source.restore',
} as const satisfies Record<VersionSource, string>;

interface DocumentVersionHistoryProps {
  versions: DocumentVersionListItem[];
  currentVersion: number;
  isVersionLoading: boolean;
  isVersionError: boolean;
  isRestoringVersion: boolean;
  onRestore: (version: DocumentVersionListItem) => void;
}

export function DocumentVersionHistory({
  versions,
  currentVersion,
  isVersionLoading,
  isVersionError,
  isRestoringVersion,
  onRestore,
}: DocumentVersionHistoryProps) {
  const { t } = useTranslation(['document', 'common']);

  if (isVersionLoading) {
    return <p className="text-sm text-muted-foreground">{t('versions.loading')}</p>;
  }

  if (isVersionError) {
    return <p className="text-sm text-destructive">{t('error.loadFailed')}</p>;
  }

  if (versions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('versions.empty')}</p>;
  }

  return (
    <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
      {versions.map((version) => {
        const isCurrent = version.version === currentVersion;

        return (
          <div key={version.id} className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold">v{version.version}</span>
                {isCurrent && <Badge variant="secondary">{t('versions.current')}</Badge>}
              </div>

              {!isCurrent && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 cursor-pointer px-2.5 text-xs"
                  disabled={isRestoringVersion}
                  onClick={() => onRestore(version)}
                >
                  <RotateCcw className="mr-1 size-3.5" />
                  {t('versions.action.restore')}
                </Button>
              )}
            </div>

            <p className="truncate text-sm font-medium" title={version.fileName}>
              {version.fileName}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(versionSourceTranslationKeys[version.source])}
            </p>

            {version.changeNote && (
              <p className="mt-1.5 wrap-break-word text-xs text-muted-foreground">
                {version.changeNote}
              </p>
            )}

            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{formatDateTime(version.createdAt)}</span>
              <span>{formatBytes(version.fileSize)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
