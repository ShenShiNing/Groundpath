import { featureFlags, vlmConfig } from '@config/env';
import { imageDescriptionService } from '@modules/document-index/services/image-description';
import { docxStructureParser } from '@modules/document-index/services/parsers/docx-structure.parser';
import { markdownStructureParser } from '@modules/document-index/services/parsers/markdown-structure.parser';
import { pdfStructureParser } from '@modules/document-index/services/parsers/pdf-structure.parser';
import type { ParsedDocumentStructure } from '@modules/document-index/services/parsers/types';
import { storageProvider } from '@modules/storage';
import { createLogger } from '@shared/logger';
import { structuredRagMetrics } from '@shared/observability';
import type { ProcessingDocument, ProcessingVersion } from './processing.types';

const logger = createLogger('processing.service');

async function parseStructuredDocument(
  input: {
    documentType: ProcessingDocument['documentType'];
    textContent: string;
    storageKey: ProcessingVersion['storageKey'];
  },
  documentId: string
): Promise<ParsedDocumentStructure | null> {
  try {
    if (input.documentType === 'markdown') {
      return markdownStructureParser.parse(input.textContent);
    }

    if (input.documentType === 'docx') {
      return await docxStructureParser.parseFromStorage(input.storageKey);
    }

    if (input.documentType === 'pdf') {
      return await pdfStructureParser.parseFromStorageWithImages(input.storageKey);
    }
  } catch (parseError) {
    logger.warn(
      { documentId, error: parseError },
      'Markdown structured parse failed; continuing with chunk fallback'
    );
  }

  return null;
}

async function enrichStructureWithImageDescriptions(input: {
  documentId: string;
  userId: string;
  knowledgeBaseId: string;
  parsedStructure: ParsedDocumentStructure;
}): Promise<void> {
  const { documentId, userId, knowledgeBaseId, parsedStructure } = input;

  if (
    !featureFlags.imageDescriptionEnabled ||
    !parsedStructure.extractedImages ||
    parsedStructure.extractedImages.length === 0
  ) {
    return;
  }

  try {
    const imageDescriptionStartedAt = Date.now();
    const figureNodes = parsedStructure.nodes.filter((node) => node.nodeType === 'figure');
    const extractedImages = parsedStructure.extractedImages;
    const documentTitle =
      parsedStructure.nodes.find((node) => node.nodeType === 'document')?.title ?? undefined;

    const descriptionInputs = [];
    for (let i = 0; i < figureNodes.length && i < extractedImages.length; i++) {
      const figureNode = figureNodes[i]!;
      const image = extractedImages[i]!;
      const storageKey = `documents/${documentId}/images/figure_${i}.png`;

      try {
        await storageProvider.upload(storageKey, image.buffer, image.mimeType);
        figureNode.imageStorageKey = storageKey;
      } catch (uploadError) {
        logger.warn(
          { documentId, nodeId: figureNode.id, error: uploadError },
          'Failed to upload figure image to storage'
        );
      }

      const parentNode = figureNode.parentId
        ? parsedStructure.nodes.find((node) => node.id === figureNode.parentId)
        : undefined;

      descriptionInputs.push({
        figureNodeId: figureNode.id,
        imageBuffer: image.buffer,
        imageMimeType: image.mimeType,
        captionText: figureNode.title ?? undefined,
        sectionTitle: parentNode?.title ?? undefined,
        documentTitle,
      });
    }

    if (descriptionInputs.length === 0) {
      return;
    }

    const descriptionResults = await imageDescriptionService.describeImages(descriptionInputs);

    let successCount = 0;
    let failCount = 0;
    for (const result of descriptionResults) {
      const figureNode = parsedStructure.nodes.find((node) => node.id === result.nodeId);
      if (!figureNode) continue;

      figureNode.imageClassification = result.classification;

      if (result.success && result.description) {
        successCount++;
        figureNode.imageDescription = result.description;
        const originalContent = figureNode.content;
        figureNode.content =
          result.description +
          (originalContent && originalContent !== '<!-- image -->' ? `\n\n${originalContent}` : '');
        figureNode.contentPreview = result.description.slice(0, 500);
      } else {
        failCount++;
      }
    }

    structuredRagMetrics.recordImageDescription({
      documentId,
      userId,
      knowledgeBaseId,
      totalFigureNodes: figureNodes.length,
      successfulDescriptions: successCount,
      failedDescriptions: failCount,
      totalLatencyMs: Date.now() - imageDescriptionStartedAt,
      vlmProvider: vlmConfig.provider,
      vlmModel: vlmConfig.model,
    });
  } catch (imageDescriptionError) {
    logger.warn(
      { documentId, error: imageDescriptionError },
      'Image description step failed; figure nodes will retain original content'
    );
  }
}

export async function prepareParsedStructure(input: {
  documentId: string;
  userId: string;
  knowledgeBaseId: string;
  document: ProcessingDocument;
  version: ProcessingVersion;
  routeMode: 'structured' | 'chunked';
}): Promise<ParsedDocumentStructure | null> {
  if (input.routeMode !== 'structured') {
    return null;
  }

  const parsedStructure = await parseStructuredDocument(
    {
      documentType: input.document.documentType,
      textContent: input.version.textContent!,
      storageKey: input.version.storageKey,
    },
    input.documentId
  );
  if (!parsedStructure) {
    return null;
  }

  await enrichStructureWithImageDescriptions({
    documentId: input.documentId,
    userId: input.userId,
    knowledgeBaseId: input.knowledgeBaseId,
    parsedStructure,
  });

  return parsedStructure;
}
