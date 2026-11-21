// utils/rateLimit.js
// A small in-memory limiter per client IP (fixed window). It stops one machine from hammering
// the sign-in routes. The per-phone limits (one code a minute, 5 an hour, 5 tries per code)
// live in authController.js and are saved in MongoDB, so they hold across restarts.
// Memory is per server process: with several servers, use a shared limiter (e.g. Redis).

function rateLimit({ windowMs, max, message }) {
  const hits = new Map(); // ip -> { count, resetAt }

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ip, h] of hits) if (h.resetAt <= now) hits.delete(ip);
  }, windowMs);
  timer.unref();

  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || "unknown";

    let h = hits.get(ip);
    if (!h || h.resetAt <= now) {
      h = { count: 0, resetAt: now + windowMs };
      hits.set(ip, h);
    }
    h.count++;

    if (h.count > max) {
      const retryAfterSeconds = Math.ceil((h.resetAt - now) / 1000);
      res.set("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({ message: message || "Too many requests, try again later", retryAfterSeconds });
    }
    next();
  };
}

module.exports = { rateLimit };
