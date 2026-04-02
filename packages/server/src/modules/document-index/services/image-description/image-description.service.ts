import { featureFlags, vlmConfig } from '@config/env';
import { createLogger } from '@core/logger';
import { vlmService } from '@modules/vlm/public/description';
import type { ImageClassification } from './image-classifier';
import { classifyImageByContext } from './image-classifier';
import { getSystemPrompt, getUserPrompt } from './image-description.prompts';

const logger = createLogger('image-description.service');

export interface ImageDescriptionInput {
  figureNodeId: string;
  imageBuffer: Buffer;
  imageMimeType: string;
  captionText?: string;
  sectionTitle?: string;
  documentTitle?: string;
}

export interface ImageDescriptionResult {
  nodeId: string;
  description: string | null;
  classification: ImageClassification;
  success: boolean;
  error?: string;
  latencyMs: number;
}

export const imageDescriptionService = {
  async describeImages(inputs: ImageDescriptionInput[]): Promise<ImageDescriptionResult[]> {
    if (!featureFlags.imageDescriptionEnabled) {
      return inputs.map((input) => ({
        nodeId: input.figureNodeId,
        description: null,
        classification: 'unknown' as ImageClassification,
        success: false,
        error: 'Image description feature is disabled',
        latencyMs: 0,
      }));
    }

    if (inputs.length === 0) return [];

    const classified = inputs.map((input) => {
      const classification = classifyImageByContext({
        captionText: input.captionText,
        sectionTitle: input.sectionTitle,
      });
      return { input, classification };
    });

    // Filter oversized images
    const eligible = classified.filter(({ input }) => {
      if (input.imageBuffer.length > vlmConfig.maxImageSizeBytes) {
        logger.info(
          {
            nodeId: input.figureNodeId,
            sizeBytes: input.imageBuffer.length,
            maxSizeBytes: vlmConfig.maxImageSizeBytes,
          },
          'Skipping oversized image for VLM description'
        );
        return false;
      }
      return true;
    });

    const skippedNodeIds = new Set(
      classified
        .filter(({ input }) => input.imageBuffer.length > vlmConfig.maxImageSizeBytes)
        .map(({ input }) => input.figureNodeId)
    );

    // Build VLM batch inputs
    const vlmInputs = eligible.map(({ input, classification }) => ({
      image: {
        base64: input.imageBuffer.toString('base64'),
        mimeType: input.imageMimeType,
      },
      systemPrompt: getSystemPrompt(),
      userPrompt: getUserPrompt(classification, {
        captionText: input.captionText,
        sectionTitle: input.sectionTitle,
        documentTitle: input.documentTitle,
      }),
    }));

    const startMs = Date.now();
    const batchResults = await vlmService.describeImageBatch(vlmInputs);

    // Map results back to inputs
    const results: ImageDescriptionResult[] = [];

    for (const { input, classification } of classified) {
      if (skippedNodeIds.has(input.figureNodeId)) {
        results.push({
          nodeId: input.figureNodeId,
          description: null,
          classification,
          success: false,
          error: 'Image exceeds maximum size',
          latencyMs: 0,
        });
        continue;
      }

      const eligibleIdx = eligible.findIndex((e) => e.input.figureNodeId === input.figureNodeId);
      const batchResult = batchResults[eligibleIdx];

      if (!batchResult) {
        results.push({
          nodeId: input.figureNodeId,
          description: null,
          classification,
          success: false,
          error: 'Missing batch result',
          latencyMs: 0,
        });
        continue;
      }

      results.push({
        nodeId: input.figureNodeId,
        description: batchResult.description,
        classification,
        success: batchResult.success,
        error: batchResult.error,
        latencyMs: Date.now() - startMs,
      });
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    logger.info(
      { total: results.length, success: successCount, failed: failCount },
      'Image description batch completed'
    );

    return results;
  },
};
