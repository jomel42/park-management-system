const buckets = new Map();

function getClientKey(req) {
  return req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
}

export function rateLimit({ windowMs = 60_000, max = 20, message = 'Demasiadas solicitudes' } = {}) {
  return (req, res, next) => {
    const key = `${getClientKey(req)}:${req.method}:${req.originalUrl.split('?')[0]}`;
    const now = Date.now();
    const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (bucket.resetAt <= now) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > max) {
      return res.status(429).json({ ok: false, error: message });
    }

    next();
  };
}

