import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { OtpRepository } from '../infrastructure/otp.repository.js';
import { sendLoginOtpEmail } from '../../../config/email.service.js';

const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 3;

function cleanUser(user) {
  const {
    password,
    codigo_verificacion,
    codigo_expira,
    codigo_hash,
    usado,
    usado_en,
    expira_en,
    intentos,
    max_intentos,
    id_otp,
    ...safe
  } = user;

  return safe;
}

function maskEmail(email) {
  const [name, domain] = String(email || '').split('@');
  if (!name || !domain) return '';
  return `${name.slice(0, 2)}***@${domain}`;
}

function createToken(user) {
  return jwt.sign(
    { id: user.id_usuario, rol: user.id_rol },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

export class OtpService {
  static generateCode() {
    return String(crypto.randomInt(100000, 1000000));
  }

  static async createLoginChallenge(user) {
    await OtpRepository.invalidateUserOtps(user.id_usuario);

    const codigo = this.generateCode();
    const codigo_hash = await bcrypt.hash(codigo, 10);
    const expira_en = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    const challengeId = await OtpRepository.create({
      id_usuario: user.id_usuario,
      email: user.email,
      codigo_hash,
      expira_en
    });

    await sendLoginOtpEmail(user.email, user.nombre, codigo);

    console.info('[auth] OTP 2FA generado', {
      id_usuario: user.id_usuario,
      id_rol: user.id_rol,
      challengeId
    });

    return {
      requires2FA: true,
      challengeId,
      emailMasked: maskEmail(user.email),
      expiresInMinutes: OTP_TTL_MINUTES
    };
  }

  static async verifyLoginChallenge(challengeId, codigo) {
    const challenge = await OtpRepository.findActiveById(challengeId);

    if (!challenge) {
      console.warn('[auth] OTP inexistente', { challengeId });
      return { status: 404, error: 'Codigo no encontrado' };
    }

    if (Number(challenge.usado) === 1) {
      console.warn('[auth] OTP reutilizado', { challengeId });
      return { status: 410, error: 'El codigo ya fue usado' };
    }

    if (new Date() > new Date(challenge.expira_en)) {
      await OtpRepository.markUsed(challengeId);
      console.warn('[auth] OTP expirado', { challengeId, id_usuario: challenge.id_usuario });
      return { status: 410, error: 'El codigo expiro' };
    }

    if (Number(challenge.intentos) >= OTP_MAX_ATTEMPTS) {
      await OtpRepository.markUsed(challengeId);
      console.warn('[auth] OTP bloqueado por intentos', { challengeId });
      return { status: 429, error: 'Codigo bloqueado por demasiados intentos' };
    }

    const valid = await bcrypt.compare(codigo, challenge.codigo_hash);

    if (!valid) {
      await OtpRepository.incrementAttempts(challengeId);
      if (Number(challenge.intentos) + 1 >= OTP_MAX_ATTEMPTS) {
        await OtpRepository.markUsed(challengeId);
      }
      console.warn('[auth] OTP incorrecto', {
        challengeId,
        intento: Number(challenge.intentos) + 1
      });
      return { status: 401, error: 'Codigo incorrecto' };
    }

    if (![1, 2].includes(Number(challenge.id_rol))) {
      await OtpRepository.markUsed(challengeId);
      return { status: 403, error: 'Este usuario no requiere 2FA' };
    }

    if (!challenge.activo || !challenge.verificado) {
      return { status: 403, error: 'Usuario inactivo o no verificado' };
    }

    await OtpRepository.markUsed(challengeId);

    const token = createToken(challenge);

    console.info('[auth] OTP 2FA validado', {
      id_usuario: challenge.id_usuario,
      id_rol: challenge.id_rol
    });

    return {
      status: 200,
      data: {
        token,
        user: cleanUser(challenge)
      }
    };
  }
}
