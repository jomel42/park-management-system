import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AuthRepository } from '../infrastructure/auth.repository.js';
import { sendVerificationEmail } from '../../../config/email.service.js';
import { OtpService } from '../../otp/application/otp.service.js';
import { rateLimit } from '../../../middlewares/rate-limit.middleware.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE  = /^[\p{L}\s'-]{2,60}$/u;
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

function isValidPassword(p) {
  return (
    typeof p === 'string' && p.length >= 8 && p.length <= 72 &&
    /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p)
  );
}

function normalizeText(v) {
  return String(v || '').trim().replace(/\s+/g, ' ');
}

function cleanUser(user) {
  const { password, codigo_verificacion, codigo_expira, ...safe } = user;
  return safe;
}

function createToken(user) {
  return jwt.sign(
    { id: user.id_usuario, rol: user.id_rol },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

function setSessionCookie(res, token) {
  res.cookie('auth_token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_MS
  });
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
router.post('/login', rateLimit({ windowMs: 5 * 60 * 1000, max: 10, message: 'Demasiados intentos de login' }), async (req, res) => {
  try {
    const email    = String(req.body.email    || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!EMAIL_RE.test(email) || !password || password.length > 72) {
      return res.status(400).json({ error: 'Correo o contrasena invalidos' });
    }

    const user = await AuthRepository.login(email);

    if (!user) {
      console.warn('[auth] Login usuario inexistente', { email });
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    if (!user.activo) {
      console.warn('[auth] Login usuario inactivo', { id_usuario: user.id_usuario });
      return res.status(403).json({ error: 'Usuario inactivo' });
    }

    // Bloquear login si no verificó el correo
    if (!user.verificado) {
      return res.status(403).json({ error: 'Debes verificar tu correo antes de ingresar' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      console.warn('[auth] Login contrasena incorrecta', { id_usuario: user.id_usuario });
      return res.status(401).json({ error: 'Contrasena incorrecta' });
    }

    if ([1, 2].includes(Number(user.id_rol))) {
      const challenge = await OtpService.createLoginChallenge(user);
      return res.json(challenge);
    }

    const token = createToken(user);
    setSessionCookie(res, token);
    console.info('[auth] Login correcto sin 2FA', {
      id_usuario: user.id_usuario,
      id_rol: user.id_rol
    });
    res.json({ token, user: cleanUser(user) });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ─── REGISTRO — paso 1: guardar pendiente y enviar código ────────────────────
router.post('/register', rateLimit({ windowMs: 10 * 60 * 1000, max: 8, message: 'Demasiados intentos de registro' }), async (req, res) => {
  try {
    const nombre            = normalizeText(req.body.nombre);
    const apellido_paterno  = normalizeText(req.body.apellido_paterno);
    const apellido_materno  = normalizeText(req.body.apellido_materno);
    const email             = String(req.body.email    || '').trim().toLowerCase();
    const password          = String(req.body.password || '');

    if (
      !NAME_RE.test(nombre) ||
      !NAME_RE.test(apellido_paterno) ||
      !NAME_RE.test(apellido_materno)
    ) {
      return res.status(400).json({ error: 'Nombre y apellidos deben tener entre 2 y 60 letras' });
    }

    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Ingresa un correo electronico valido' });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        error: 'La contrasena debe tener 8 caracteres, mayuscula, minuscula, numero y simbolo'
      });
    }

    // ¿Ya existe? (verificado o no)
    const exists = await AuthRepository.login(email);
    if (exists) {
      // Si existe pero no verificó, reenviar código
      if (!exists.verificado) {
        const codigo = generateCode();
        const expira = new Date(Date.now() + 15 * 60 * 1000);
        await AuthRepository.updateCode(email, codigo, expira);
        await sendVerificationEmail(email, exists.nombre, codigo);
        return res.status(200).json({ pendiente: true, message: 'Codigo reenviado a tu correo' });
      }
      return res.status(409).json({ error: 'Ya existe un usuario con ese correo' });
    }

    const hash   = await bcrypt.hash(password, 10);
    const codigo = generateCode();
    const expira = new Date(Date.now() + 15 * 60 * 1000);

    await AuthRepository.registerPending({
      nombre, apellido_paterno, apellido_materno,
      email, password: hash, codigo, expira
    });

    await sendVerificationEmail(email, nombre, codigo);

    // NO devolvemos token todavía — el usuario debe verificar primero
    res.status(201).json({ pendiente: true, message: 'Codigo enviado a tu correo' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error registrando usuario' });
  }
});

// ─── VERIFICAR EMAIL — paso 2: validar código y activar cuenta ────────────────
router.post('/verify-email', rateLimit({ windowMs: 10 * 60 * 1000, max: 10, message: 'Demasiados intentos de verificacion' }), async (req, res) => {
  try {
    const email  = String(req.body.email  || '').trim().toLowerCase();
    const codigo = String(req.body.codigo || '').trim();

    if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(codigo)) {
      return res.status(400).json({ error: 'Datos invalidos' });
    }

    const user = await AuthRepository.findPendingByEmail(email);

    if (!user) {
      return res.status(404).json({ error: 'No hay una cuenta pendiente con ese correo' });
    }

    if (user.codigo_verificacion !== codigo) {
      return res.status(401).json({ error: 'Codigo incorrecto' });
    }

    if (new Date() > new Date(user.codigo_expira)) {
      return res.status(410).json({ error: 'El codigo expiro, solicita uno nuevo' });
    }

    await AuthRepository.markVerified(user.id_usuario);

    const fullUser = await AuthRepository.login(email);
    const token    = createToken(fullUser);
    setSessionCookie(res, token);

    res.json({ token, user: cleanUser(fullUser) });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error verificando cuenta' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('auth_token', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production'
  });
  res.json({ ok: true });
});

export default router;
