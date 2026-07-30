export function requireRoles(...roles) {
  return (req, res, next) => {
    const userRole = Number(req.user?.rol);

    if (!roles.includes(userRole)) {
      return res.status(403).json({ ok: false, error: 'Permisos insuficientes' });
    }

    next();
  };
}

