import jwt from 'jsonwebtoken';

function cookieValue(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  for (const cookie of cookies) {
    const [rawKey, ...rawValue] = cookie.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rawValue.join('='));
  }
  return null;
}

function requestToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return cookieValue(req, 'auth_token');
}

export function requireAuth(req, res, next) {
  const token = requestToken(req);

  if (!token) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Token invalido o expirado' });
  }
}

export function requirePageAuth(...roles) {
  return (req, res, next) => {
    const token = requestToken(req);
    if (!token) return res.redirect('/login');

    try {
      const user = jwt.verify(token, process.env.JWT_SECRET);
      if (roles.length && !roles.map(Number).includes(Number(user.rol))) {
        return res.redirect('/login');
      }
      req.user = user;
      next();
    } catch {
      res.clearCookie?.('auth_token');
      return res.redirect('/login');
    }
  };
}
