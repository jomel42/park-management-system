import { Router } from 'express';
import { OtpController } from './otp.controller.js';
import { rateLimit } from '../../../middlewares/rate-limit.middleware.js';

const router = Router();

router.post(
  '/2fa/verify',
  rateLimit({ windowMs: 5 * 60 * 1000, max: 8, message: 'Demasiados intentos de verificacion' }),
  OtpController.verify
);

export default router;

