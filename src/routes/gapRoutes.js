/**
 * POST /api/gapAnalysis
 *
 * Generates a comprehensive gap analysis and action plan for a student
 * at a specific school, based on their evaluation results.
 *
 * Body: {
 *   universityName: string (required),
 *   evaluationResult: object (optional — if not provided, runs a fresh evaluation),
 *   application: object (optional — student profile for context),
 *   timelineStage: string (optional — exploring | building | applying | finalizing; defaults to applying)
 * }
 *
 * Returns: complete gap analysis with action plan
 */

const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { attachTier } = require('../middleware/tierAccess');
const { generateGapAnalysis } = require('../engine/gapAnalysis');
const evaluationEngine = require('../engine/evaluationEngine');
const universityDataLoader = require('../loaders/universityDataLoader');
const { normalizeApplicationInput } = require('../schemas/canonicalApplication');

const router = express.Router();

const VALID_TIMELINE_STAGES = new Set(['exploring', 'building', 'applying', 'finalizing']);

/** Local testing: ESSAY_DEV_NO_AUTH=1 or GAP_DEV_NO_AUTH=1 when NODE_ENV is not production. */
function gapAuth(req, res, next) {
  if (
    process.env.NODE_ENV !== 'production' &&
    (process.env.ESSAY_DEV_NO_AUTH === '1' || process.env.GAP_DEV_NO_AUTH === '1')
  ) {
    req.userId = 'dev-local-gap';
    return next();
  }
  return requireAuth(req, res, next);
}

// Gap analysis rate limiting (separate from evaluation and essay limits)
const gapLimits = new Map();

function gapRateLimit(req, res, next) {
  const userId = req.userId;
  const tier = req.userTier || 'free';
  const today = new Date().toISOString().slice(0, 10);
  const key = `gap:${userId}:${today}`;
  const count = gapLimits.get(key) || 0;

  // Free: 1 per day, Paid: 5 per day
  const maxAllowed = tier === 'free' ? 1 : 5;

  if (count >= maxAllowed) {
    return res.status(403).json({
      error: tier === 'free'
        ? 'You\'ve used your free action plan. Upgrade to Season Pass for unlimited gap analyses.'
        : 'Daily gap analysis limit reached. Try again tomorrow.',
      upgradeRequired: tier === 'free',
      retryable: tier !== 'free',
    });
  }
  gapLimits.set(key, count + 1);
  next();
}

function validateGapRequest(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be a JSON object'] };
  }

  if (!body.universityName || typeof body.universityName !== 'string') {
    errors.push('Missing required field: "universityName"');
  }

  // Either evaluationResult or application must be provided
  if (!body.evaluationResult && !body.application) {
    errors.push('Either "evaluationResult" or "application" must be provided');
  }

  if (
    body.timelineStage != null &&
    body.timelineStage !== '' &&
    (typeof body.timelineStage !== 'string' || !VALID_TIMELINE_STAGES.has(body.timelineStage))
  ) {
    errors.push(
      'Invalid "timelineStage". Use one of: exploring, building, applying, finalizing (or omit for default applying).',
    );
  }

  return {
    valid: errors.length === 0,
    errors: errors.length ? errors : undefined,
  };
}

router.post('/gapAnalysis', gapAuth, attachTier, gapRateLimit, async (req, res, next) => {
  const validation = validateGapRequest(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Validation failed', details: validation.errors });
  }

  const { universityName, evaluationResult, application } = req.body;

  // Find the university profile
  const profiles = universityDataLoader.getByNames([universityName]);
  if (!profiles || profiles.length === 0) {
    return res.status(400).json({
      error: `University "${universityName}" is not supported.`,
    });
  }

  const universityProfile = profiles[0];

  console.log(`[API] POST /api/gapAnalysis for ${universityName} (user: ${req.userId})`);

  try {
    let evalResult = evaluationResult;
    let normalizedApp = null;

    // Normalize application if provided
    if (application && typeof application === 'object') {
      try {
        normalizedApp = normalizeApplicationInput(application);
      } catch (err) {
        console.warn('[GapAnalysis] Failed to normalize application:', err.message);
      }
    }

    // If no evaluation result provided, run a fresh evaluation
    if (!evalResult && normalizedApp) {
      console.log(`[GapAnalysis] No evaluation result provided, running fresh evaluation for ${universityName}`);
      evalResult = await evaluationEngine.evaluate(normalizedApp, universityProfile);
    }

    if (!evalResult) {
      return res.status(400).json({
        error: 'Could not generate evaluation. Please provide application data or an existing evaluation result.',
      });
    }

    const timelineStage =
      req.body.timelineStage && VALID_TIMELINE_STAGES.has(req.body.timelineStage)
        ? req.body.timelineStage
        : 'applying';

    const result = await generateGapAnalysis(evalResult, universityProfile, normalizedApp || application, {
      timelineStage,
    });

    if (result.error) {
      return res.status(502).json({ error: result.error, school: result.school });
    }

    res.json(result);
  } catch (err) {
    console.error('[GapAnalysis] Failed:', err);
    next(err);
  }
});

module.exports = router;
