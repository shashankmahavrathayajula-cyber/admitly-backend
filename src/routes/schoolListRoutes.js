/**
 * POST /api/buildSchoolList
 *
 * Evaluates a student's profile against all supported schools
 * and recommends a strategic reach/target/safety mix.
 *
 * Body: {
 *   application: object (required — full student profile)
 * }
 *
 * Returns: classified schools with strategic recommendation
 */

const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { buildSchoolList } = require('../engine/schoolListBuilder');

const router = express.Router();

/** Local testing: SCHOOL_LIST_DEV_NO_AUTH=1 when NODE_ENV is not production. */
function listAuth(req, res, next) {
  if (process.env.NODE_ENV !== 'production' && process.env.SCHOOL_LIST_DEV_NO_AUTH === '1') {
    req.userId = 'dev-local-list';
    return next();
  }
  return requireAuth(req, res, next);
}

// School list rate limiting (this is an expensive operation — runs all schools)
const listLimits = new Map();
const MAX_LIST_BUILDS_PER_DAY = 3;

function listRateLimit(req, res, next) {
  const userId = req.userId;
  const today = new Date().toISOString().slice(0, 10);
  const key = `list:${userId}:${today}`;
  const count = listLimits.get(key) || 0;
  if (count >= MAX_LIST_BUILDS_PER_DAY) {
    return res.status(429).json({
      error: 'Daily school list limit reached (3 per day)',
      retryable: false,
    });
  }
  listLimits.set(key, count + 1);
  next();
}

function validateListRequest(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be a JSON object'] };
  }
  if (!body.application || typeof body.application !== 'object') {
    return { valid: false, errors: ['Missing required field: "application" (object)'] };
  }
  return { valid: true };
}

router.post('/buildSchoolList', listAuth, listRateLimit, async (req, res, next) => {
  const validation = validateListRequest(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Validation failed', details: validation.errors });
  }

  console.log(`[API] POST /api/buildSchoolList (user: ${req.userId})`);

  try {
    const result = await buildSchoolList(req.body.application);
    res.json(result);
  } catch (err) {
    console.error('[SchoolListBuilder] Failed:', err);
    next(err);
  }
});

module.exports = router;
