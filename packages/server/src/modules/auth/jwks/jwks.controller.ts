import type { Request, Response } from 'express';
import { jwksService } from './jwks.service';

export const jwksController = {
  getJwks(_req: Request, res: Response): void {
    res.json(jwksService.getPublicJwks());
  },
};
