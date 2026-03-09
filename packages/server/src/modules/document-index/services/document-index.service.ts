import { v4 as uuidv4 } from 'uuid';
import { documentIndexVersionRepository } from '../repositories/document-index-version.repository';
import { documentIndexActivationService } from './document-index-activation.service';

export interface StartIndexBuildInput {
  documentId: string;
  documentVersion: number;
  routeMode: 'structured' | 'chunked';
  targetIndexVersion?: string;
  workerJobId?: string;
  createdBy?: string;
}

export interface CompleteIndexBuildInput {
  indexVersionId: string;
  parseMethod: string;
  parserRuntime: string;
  headingCount?: number;
  parseDurationMs?: number;
  error?: string | null;
}

export const documentIndexService = {
  async startBuild(input: StartIndexBuildInput) {
    const indexVersion = input.targetIndexVersion ?? `idx-${uuidv4()}`;
    return documentIndexVersionRepository.create({
      id: uuidv4(),
      documentId: input.documentId,
      documentVersion: input.documentVersion,
      indexVersion,
      routeMode: input.routeMode,
      status: 'building',
      workerJobId: input.workerJobId ?? null,
      createdBy: input.createdBy ?? null,
    });
  },

  async completeBuild(input: CompleteIndexBuildInput) {
    await documentIndexVersionRepository.update(input.indexVersionId, {
      parseMethod: input.parseMethod,
      parserRuntime: input.parserRuntime,
      headingCount: input.headingCount ?? 0,
      parseDurationMs: input.parseDurationMs,
      error: input.error ?? null,
    });

    return documentIndexActivationService.activateVersion(input.indexVersionId);
  },

  async failBuild(indexVersionId: string, error: string) {
    return documentIndexActivationService.markFailed(indexVersionId, error);
  },

  async supersedeBuild(indexVersionId: string) {
    return documentIndexActivationService.markSuperseded(indexVersionId);
  },
};
