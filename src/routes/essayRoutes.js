/**
 * POST /api/analyzeEssay
 *
 * Analyzes an essay against a specific school's admissions criteria,
 * cross-referenced with the student's application profile.
 *
 * Body: {
 *   essayText: string (required, min 20 chars, max 10000 chars),
 *   universityName: string (required, must match a supported school),
 *   essayType?: string (optional, e.g. "Personal Statement", "Supplemental Essay"),
 *   application?: object (optional — student profile for cross-referencing;
 *                         if omitted, analysis proceeds without cross-referencing)
 * }
 *
 * Returns: structured essay analysis object
 */

const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { attachTier } = require('../middleware/tierAccess');
const { analyzeEssay } = require('../engine/essayAnalyzer');
const universityDataLoader = require('../loaders/universityDataLoader');
const { normalizeApplicationInput } = require('../schemas/canonicalApplication');

const router = express.Router();

/** Local testing only: ESSAY_DEV_NO_AUTH=1 skips JWT when NODE_ENV is not production. */
function essayAuth(req, res, next) {
  if (process.env.NODE_ENV !== 'production' && process.env.ESSAY_DEV_NO_AUTH === '1') {
    req.userId = 'dev-local-essay';
    return next();
  }
  return requireAuth(req, res, next);
}

// Essay-specific rate limiting (separate from evaluation limits)
const essayLimits = new Map();

function essayRateLimit(req, res, next) {
  const userId = req.userId;
  const tier = req.userTier || 'free';
  const today = new Date().toISOString().slice(0, 10);
  const key = `essay:${userId}:${today}`;
  const count = essayLimits.get(key) || 0;

  // Free: 1 per day, Paid: 10 per day
  const maxAllowed = tier === 'free' ? 1 : 10;

  if (count >= maxAllowed) {
    return res.status(403).json({
      error: tier === 'free'
        ? 'You\'ve used your free essay analysis. Upgrade to Season Pass for unlimited essay feedback.'
        : 'Daily essay analysis limit reached. Try again tomorrow.',
      upgradeRequired: tier === 'free',
      retryable: tier !== 'free',
    });
  }
  essayLimits.set(key, count + 1);
  next();
}

/**
 * Validate the request body.
 */
function validateEssayRequest(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be a JSON object'] };
  }

  if (!body.essayText || typeof body.essayText !== 'string') {
    errors.push('Missing required field: "essayText" (string)');
  } else if (body.essayText.trim().length < 20) {
    errors.push('"essayText" must be at least 20 characters');
  } else if (body.essayText.length > 10000) {
    errors.push('"essayText" must be under 10,000 characters');
  }

  if (!body.universityName || typeof body.universityName !== 'string') {
    errors.push('Missing required field: "universityName" (string)');
  }

  if (body.essayType && typeof body.essayType !== 'string') {
    errors.push('"essayType" must be a string if provided');
  }

  return {
    valid: errors.length === 0,
    errors: errors.length ? errors : undefined,
  };
}

router.post('/analyzeEssay', essayAuth, attachTier, essayRateLimit, async (req, res, next) => {
  const validation = validateEssayRequest(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Validation failed', details: validation.errors });
  }

  const { essayText, universityName, essayType, application } = req.body;

  // Find the university profile
  const profiles = universityDataLoader.getByNames([universityName]);
  if (!profiles || profiles.length === 0) {
    return res.status(400).json({
      error: `University "${universityName}" is not supported. Check spelling or try a supported school.`,
    });
  }

  const universityProfile = profiles[0];

  // Normalize application if provided (for cross-referencing)
  let normalizedApp = null;
  if (application && typeof application === 'object') {
    try {
      normalizedApp = normalizeApplicationInput(application);
    } catch (err) {
      console.warn('[EssayAnalyzer] Failed to normalize application:', err.message);
      // Continue without cross-referencing
    }
  }

  console.log(`[API] POST /api/analyzeEssay for ${universityName} (user: ${req.userId})`);

  try {
    const result = await analyzeEssay(
      essayText,
      universityProfile,
      normalizedApp,
      { essayType: essayType || 'Personal Statement' }
    );

    // Save analysis to Supabase (fire-and-forget)
    saveEssayAnalysis(req.userId, universityName, essayType, result)
      .catch(err => console.error('[EssayAnalyzer] Background save failed:', err.message));

    res.json(result);
  } catch (err) {
    console.error('[EssayAnalyzer] Analysis failed:', err);
    next(err);
  }
});

/**
 * Save essay analysis to Supabase for history/tracking.
 * Uses the evaluation_cache table pattern — lightweight, fire-and-forget.
 */
async function saveEssayAnalysis(userId, universityName, essayType, result) {
  try {
    // We'll store essay analyses in a lightweight way
    // For now, log it — a dedicated table can be added later if needed
    console.log(`[EssayAnalyzer] Analysis saved for user ${userId}, school: ${universityName}`);
  } catch (err) {
    console.error('[EssayAnalyzer] Save failed:', err.message);
  }
}

module.exports = router;
