import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { StructuredRagDashboardKnowledgeBaseBreakdown } from '@groundpath/shared/types';
import { formatMs, formatPercent } from './utils';

interface StructuredRagBreakdownTableProps {
  knowledgeBaseBreakdown: StructuredRagDashboardKnowledgeBaseBreakdown[];
  knowledgeBases: Array<{ id: string; name: string }>;
}

export function StructuredRagBreakdownTable({
  knowledgeBaseBreakdown,
  knowledgeBases,
}: StructuredRagBreakdownTableProps) {
  const { t } = useTranslation('dashboard');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('structuredRag.breakdown.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {knowledgeBaseBreakdown.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('structuredRag.breakdown.empty')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('structuredRag.breakdown.columns.knowledgeBase')}</TableHead>
                <TableHead>{t('structuredRag.breakdown.columns.executions')}</TableHead>
                <TableHead>{t('structuredRag.breakdown.columns.fallback')}</TableHead>
                <TableHead>{t('structuredRag.breakdown.columns.coverage')}</TableHead>
                <TableHead>{t('structuredRag.breakdown.columns.providerErrors')}</TableHead>
                <TableHead>{t('structuredRag.breakdown.columns.freshness')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {knowledgeBaseBreakdown.map((item) => {
                const knowledgeBaseName =
                  knowledgeBases.find((knowledgeBase) => knowledgeBase.id === item.knowledgeBaseId)
                    ?.name ?? item.knowledgeBaseId;

                return (
                  <TableRow key={item.knowledgeBaseId}>
                    <TableCell className="max-w-56 truncate">{knowledgeBaseName}</TableCell>
                    <TableCell>{item.agentExecutions}</TableCell>
                    <TableCell>{formatPercent(item.fallbackRatio)}</TableCell>
                    <TableCell>{formatPercent(item.structuredCoverage)}</TableCell>
                    <TableCell>{formatPercent(item.providerErrorRate)}</TableCell>
                    <TableCell>{formatMs(item.avgFreshnessLagMs)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
