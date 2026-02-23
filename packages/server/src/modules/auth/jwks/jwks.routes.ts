import express from 'express';
import { jwksController } from './jwks.controller';

const router = express.Router();

router.get('/.well-known/jwks.json', jwksController.getJwks);

export default router;
