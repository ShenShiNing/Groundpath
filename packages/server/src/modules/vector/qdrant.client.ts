import { QdrantClient } from '@qdrant/js-client-rest';
import { vectorConfig } from '@config/env';
import { createLogger } from '@shared/logger';
import type { EmbeddingProviderType } from '@knowledge-agent/shared/types';

const logger = createLogger('qdrant.client');

let client: QdrantClient | null = null;

// Track which collections have been initialized
const initializedCollections = new Set<string>();

const PAYLOAD_INDEXES = [
  { field_name: 'userId', field_schema: 'keyword' as const },
  { field_name: 'documentId', field_schema: 'keyword' as const },
  { field_name: 'knowledgeBaseId', field_schema: 'keyword' as const },
  { field_name: 'isDeleted', field_schema: 'bool' as const },
];

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return '';
  const details = error as Error & {
    data?: { status?: { error?: string } };
    message?: string;
  };
  return details.data?.status?.error ?? details.message ?? '';
}

function isIndexAlreadyExistsError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('already exists') ||
    message.includes('index exists') ||
    message.includes('field is already indexed')
  );
}

async function ensurePayloadIndexes(qdrant: QdrantClient, collectionName: string): Promise<void> {
  for (const index of PAYLOAD_INDEXES) {
    try {
      await qdrant.createPayloadIndex(collectionName, {
        ...index,
        wait: true,
      });
    } catch (error) {
      if (!isIndexAlreadyExistsError(error)) {
        throw error;
      }
    }
  }
}

export function getQdrantClient(): QdrantClient {
  if (!client) {
    client = new QdrantClient({
      url: vectorConfig.url,
      ...(vectorConfig.apiKey && { apiKey: vectorConfig.apiKey }),
    });
    logger.info({ url: vectorConfig.url }, 'Qdrant client created');
  }
  return client;
}

/**
 * Generate collection name from provider and dimensions
 */
export function getCollectionName(provider: EmbeddingProviderType, dimensions: number): string {
  return `embedding_${provider}_${dimensions}`;
}

/**
 * Ensure a collection exists with the specified dimensions
 * Uses in-memory cache to avoid repeated checks
 */
export async function ensureCollection(collectionName: string, dimensions: number): Promise<void> {
  // Skip if already initialized in this session
  if (initializedCollections.has(collectionName)) {
    return;
  }

  const qdrant = getQdrantClient();

  let collectionExists = false;
  try {
    const exists = await qdrant.collectionExists(collectionName);
    collectionExists = exists.exists;
  } catch (error) {
    logger.warn(
      { collectionName, error: getErrorMessage(error) || error },
      'Failed to check Qdrant collection existence'
    );
  }

  if (collectionExists) {
    const info = await qdrant.getCollection(collectionName);
    const collection = (info as { result?: unknown }).result ?? info;
    const vectorsConfig =
      (collection as { vectors?: { size?: number } }).vectors ??
      // fallback for older server shape
      (collection as { config?: { params?: { vectors?: { size?: number } } } }).config?.params
        ?.vectors;
    const existingSize = vectorsConfig?.size;

    if (typeof existingSize === 'number' && existingSize !== dimensions) {
      throw new Error(
        `Qdrant collection ${collectionName} has dimensions ${existingSize}, expected ${dimensions}. ` +
          'Please recreate the collection or align the knowledge base embedding config.'
      );
    }

    logger.info(
      { collectionName, dimensions: existingSize ?? 'unknown' },
      'Qdrant collection already exists'
    );
    await ensurePayloadIndexes(qdrant, collectionName);
    initializedCollections.add(collectionName);
    return;
  }

  await qdrant.createCollection(collectionName, {
    vectors: {
      size: dimensions,
      distance: 'Cosine',
    },
    optimizers_config: {
      default_segment_number: 2,
    },
  });

  await ensurePayloadIndexes(qdrant, collectionName);

  initializedCollections.add(collectionName);
  logger.info({ collectionName, dimensions }, 'Qdrant collection created');
}

/**
 * Reset the initialized collections cache (for testing)
 */
export function resetCollectionCache(): void {
  initializedCollections.clear();
}
