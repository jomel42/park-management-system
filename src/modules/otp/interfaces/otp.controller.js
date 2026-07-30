import { OtpService } from '../application/otp.service.js';

const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

function setSessionCookie(res, token) {
  res.cookie('auth_token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_MS
  });
}

export class OtpController {
  static async verify(req, res) {
    try {
      const challengeId = Number(req.body.challengeId);
      const codigo = String(req.body.codigo || '').trim();

      if (!Number.isInteger(challengeId) || challengeId <= 0 || !/^\d{6}$/.test(codigo)) {
        return res.status(400).json({ error: 'Datos invalidos' });
      }

      const result = await OtpService.verifyLoginChallenge(challengeId, codigo);

      if (result.status !== 200) {
        return res.status(result.status).json({ error: result.error });
      }

      setSessionCookie(res, result.data.token);
      res.json(result.data);
    } catch (error) {
      console.error('[auth] Error verificando OTP', error);
      res.status(500).json({ error: 'Error verificando codigo' });
    }
  }
}
