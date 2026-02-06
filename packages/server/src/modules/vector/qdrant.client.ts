import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from '@config/env';
import { createLogger } from '@shared/logger';
import type { EmbeddingProviderType } from '@knowledge-agent/shared/types';

const logger = createLogger('qdrant.client');

let client: QdrantClient | null = null;

// Track which collections have been initialized
const initializedCollections = new Set<string>();

export function getQdrantClient(): QdrantClient {
  if (!client) {
    client = new QdrantClient({
      url: env.QDRANT_URL,
      ...(env.QDRANT_API_KEY && { apiKey: env.QDRANT_API_KEY }),
    });
    logger.info({ url: env.QDRANT_URL }, 'Qdrant client created');
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

  try {
    const exists = await qdrant.collectionExists(collectionName);
    if (exists.exists) {
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
      initializedCollections.add(collectionName);
      return;
    }
  } catch {
    // Collection doesn't exist, create it
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

  // Create payload indexes for filtering
  await qdrant.createPayloadIndex(collectionName, {
    field_name: 'userId',
    field_schema: 'keyword',
  });
  await qdrant.createPayloadIndex(collectionName, {
    field_name: 'documentId',
    field_schema: 'keyword',
  });
  await qdrant.createPayloadIndex(collectionName, {
    field_name: 'knowledgeBaseId',
    field_schema: 'keyword',
  });
  await qdrant.createPayloadIndex(collectionName, {
    field_name: 'isDeleted',
    field_schema: 'bool',
  });

  initializedCollections.add(collectionName);
  logger.info({ collectionName, dimensions }, 'Qdrant collection created');
}

/**
 * Reset the initialized collections cache (for testing)
 */
export function resetCollectionCache(): void {
  initializedCollections.clear();
}
