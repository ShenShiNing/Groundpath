import express from 'express';
import { oauthController } from './oauth.controller';
import { validateBody } from '@shared/middleware';
import { oauthExchangeRequestSchema } from '@knowledge-agent/shared/schemas';

const router = express.Router();

// GitHub OAuth
router.get('/github', oauthController.githubAuth);
router.get('/github/callback', oauthController.githubCallback);

// Google OAuth
router.get('/google', oauthController.googleAuth);
router.get('/google/callback', oauthController.googleCallback);
router.post('/exchange', validateBody(oauthExchangeRequestSchema), oauthController.exchange);

export default router;
