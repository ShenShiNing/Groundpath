import { structuredRagObservabilityConfig } from '@config/env';
import { withTransaction } from '@core/db/db.utils';
import type { CreateSystemLogInput } from '../repositories/system-log.repository';
import { systemLogRepository } from '../repositories/system-log.repository';
import {
  structuredRagMetricRollupRepository,
  type StructuredRagMetricRollupInput,
} from '../repositories/structured-rag-metric-rollup.repository';

type StructuredRagMetricRollupPayload =
  | Omit<Extract<StructuredRagMetricRollupInput, { eventType: 'agent_execution' }>, 'createdAt'>
  | Omit<Extract<StructuredRagMetricRollupInput, { eventType: 'index_build' }>, 'createdAt'>
  | Omit<Extract<StructuredRagMetricRollupInput, { eventType: 'index_graph' }>, 'createdAt'>;

export interface RecordStructuredRagMetricInput {
  log: CreateSystemLogInput;
  rollup?: StructuredRagMetricRollupPayload;
}

function floorToRollupBucket(createdAt: Date): Date {
  const bucket = new Date(createdAt);
  const bucketMinutes = structuredRagObservabilityConfig.rollupBucketMinutes;

  bucket.setUTCSeconds(0, 0);
  bucket.setUTCMinutes(bucket.getUTCMinutes() - (bucket.getUTCMinutes() % bucketMinutes));

  return bucket;
}

export async function recordStructuredRagMetric(
  input: RecordStructuredRagMetricInput
): Promise<void> {
  const createdAt = new Date();

  await withTransaction(async (tx) => {
    await systemLogRepository.create(
      {
        ...input.log,
        createdAt,
      },
      tx
    );

    if (!input.rollup) {
      return;
    }

    await structuredRagMetricRollupRepository.upsert(
      addCreatedAt(input.rollup, createdAt),
      floorToRollupBucket(createdAt),
      tx
    );
  });
}

function addCreatedAt(
  rollup: StructuredRagMetricRollupPayload,
  createdAt: Date
): StructuredRagMetricRollupInput {
  switch (rollup.eventType) {
    case 'agent_execution':
      return { ...rollup, createdAt };
    case 'index_build':
      return { ...rollup, createdAt };
    case 'index_graph':
      return { ...rollup, createdAt };
  }
}
