import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRoles } from '../../middlewares/roles.middleware.js';
import { rateLimit } from '../../middlewares/rate-limit.middleware.js';
import { sendMessage } from './chatbot.controller.js';

const router = Router();

router.post(
  '/message',
  requireAuth,
  requireRoles(3),
  rateLimit({ windowMs: 60_000, max: 12, message: 'Demasiadas consultas al chatbot' }),
  sendMessage
);

export default router;
