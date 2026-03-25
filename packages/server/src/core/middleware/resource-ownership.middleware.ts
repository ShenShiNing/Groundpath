import type { Request, Response, RequestHandler } from 'express';
import type { OwnedResourceKey } from '@core/types';
import { asyncHandler } from '@core/errors/async-handler';
import { Errors } from '@core/errors/app-error';
import { requireUserId } from '@core/utils';

interface ResourceOwnershipContext {
  req: Request;
  res: Response;
  userId: string;
  resourceId: string;
}

interface ResourceOwnershipOptions<TResource> {
  resourceKey?: OwnedResourceKey;
  missingResourceMessage?: string;
  resolveOwnedResource(ctx: ResourceOwnershipContext): Promise<TResource>;
  resolveResourceId(req: Request, res: Response): string | undefined;
}

export function requireResourceOwnership<TResource>(
  options: ResourceOwnershipOptions<TResource>
): RequestHandler {
  return asyncHandler(async (req, res, next) => {
    const userId = requireUserId(req);
    const resourceId = options.resolveResourceId(req, res);

    if (!resourceId) {
      throw Errors.validation(options.missingResourceMessage ?? 'Resource ID is required');
    }

    const resource = await options.resolveOwnedResource({
      req,
      res,
      userId,
      resourceId,
    });

    if (options.resourceKey) {
      res.locals.ownedResources = {
        ...res.locals.ownedResources,
        [options.resourceKey]: resource,
      };
    }

    next();
  });
}
