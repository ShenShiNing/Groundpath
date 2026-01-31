import express from 'express';
import { oauthController } from './oauth.controller';

const router = express.Router();

// GitHub OAuth
router.get('/github', oauthController.githubAuth);
router.get('/github/callback', oauthController.githubCallback);

// Google OAuth
router.get('/google', oauthController.googleAuth);
router.get('/google/callback', oauthController.googleCallback);

export default router;
