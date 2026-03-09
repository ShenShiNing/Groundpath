import { withTransaction, type Transaction } from '@shared/db/db.utils';
import { Errors } from '@shared/errors';
import { createLogger } from '@shared/logger';
import { documentRepository } from '@modules/document';
import { documentIndexVersionRepository } from '../repositories/document-index-version.repository';

const logger = createLogger('document-index-activation.service');

export const documentIndexActivationService = {
  async activateVersion(indexVersionId: string, tx?: Transaction) {
    return withTransaction(async (trx) => {
      const version = await documentIndexVersionRepository.findById(indexVersionId, trx);
      if (!version) {
        throw Errors.notFound('Document index version');
      }

      await documentIndexVersionRepository.supersedeActiveByDocumentId(
        version.documentId,
        version.id,
        trx
      );
      const activatedVersion = await documentIndexVersionRepository.update(
        version.id,
        {
          status: 'active',
          error: null,
          activatedAt: new Date(),
        },
        trx
      );
      await documentRepository.update(
        version.documentId,
        {
          activeIndexVersionId: version.id,
        },
        trx
      );

      logger.info(
        {
          documentId: version.documentId,
          documentVersion: version.documentVersion,
          indexVersionId: version.id,
          indexVersion: version.indexVersion,
        },
        'Activated document index version'
      );

      return activatedVersion;
    }, tx);
  },

  async markFailed(indexVersionId: string, error: string, tx?: Transaction) {
    return withTransaction(async (trx) => {
      const version = await documentIndexVersionRepository.findById(indexVersionId, trx);
      if (!version) {
        throw Errors.notFound('Document index version');
      }

      const failedVersion = await documentIndexVersionRepository.update(
        version.id,
        {
          status: 'failed',
          error,
        },
        trx
      );

      const document = await documentRepository.findById(version.documentId, trx);
      if (document?.activeIndexVersionId === version.id) {
        await documentRepository.update(
          version.documentId,
          {
            activeIndexVersionId: null,
          },
          trx
        );
      }

      logger.warn(
        {
          documentId: version.documentId,
          documentVersion: version.documentVersion,
          indexVersionId: version.id,
          error,
        },
        'Marked document index version as failed'
      );

      return failedVersion;
    }, tx);
  },

  async markSuperseded(indexVersionId: string, tx?: Transaction) {
    return withTransaction(async (trx) => {
      const version = await documentIndexVersionRepository.findById(indexVersionId, trx);
      if (!version) {
        throw Errors.notFound('Document index version');
      }

      const supersededVersion = await documentIndexVersionRepository.update(
        version.id,
        {
          status: 'superseded',
        },
        trx
      );

      const document = await documentRepository.findById(version.documentId, trx);
      if (document?.activeIndexVersionId === version.id) {
        await documentRepository.update(
          version.documentId,
          {
            activeIndexVersionId: null,
          },
          trx
        );
      }

      logger.info(
        {
          documentId: version.documentId,
          documentVersion: version.documentVersion,
          indexVersionId: version.id,
        },
        'Marked document index version as superseded'
      );

      return supersededVersion;
    }, tx);
  },
};
