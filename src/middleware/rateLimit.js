const limits = new Map();
const MAX_PER_DAY = 10;

function rateLimit(req, res, next) {
  const userId = req.userId;
  const today = new Date().toISOString().slice(0, 10);
  const key = `${userId}:${today}`;
  const count = limits.get(key) || 0;
  if (count >= MAX_PER_DAY) {
    return res.status(429).json({
      error: 'Daily evaluation limit reached (10 per day)',
      retryable: false,
    });
  }
  limits.set(key, count + 1);
  next();
}

module.exports = { rateLimit };
