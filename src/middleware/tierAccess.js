/**
 * Tier-based access control middleware.
 *
 * Checks the user's subscription tier and enforces feature limits.
 * Attaches req.userTier to the request for downstream use.
 *
 * Free tier limits:
 * - 2 evaluations total
 * - 1 essay analysis (top-level only)
 * - 1 gap analysis
 * - No school list builder
 * - No re-evaluation of same school
 *
 * Season Pass / Premium: unlimited everything
 */

const { getUserTier } = require('../services/stripeService');
const { supabase } = require('../lib/supabase');

/**
 * Middleware that attaches the user's tier to the request.
 * Use on any route where tier matters.
 */
async function attachTier(req, res, next) {
  try {
    req.userTier = await getUserTier(req.userId);
  } catch {
    req.userTier = 'free';
  }
  next();
}

/**
 * Require a paid tier (season_pass or premium).
 * Returns 403 if user is on free tier.
 */
function requirePaid(req, res, next) {
  if (!req.userTier || req.userTier === 'free') {
    return res.status(403).json({
      error: 'This feature requires a Season Pass or Premium subscription.',
      upgradeRequired: true,
      tier: 'free',
    });
  }
  next();
}

/**
 * Require premium tier specifically.
 */
function requirePremium(req, res, next) {
  if (req.userTier !== 'premium') {
    return res.status(403).json({
      error: 'This feature requires a Premium subscription.',
      upgradeRequired: true,
      tier: req.userTier || 'free',
    });
  }
  next();
}

/**
 * Check evaluation limits for free users.
 * Free: 2 total evaluations. Paid: unlimited.
 */
async function checkEvaluationLimit(req, res, next) {
  if (req.userTier && req.userTier !== 'free') {
    return next(); // Paid users: no limit
  }

  try {
    const { count, error } = await supabase
      .from('evaluations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.userId);

    if (error) {
      console.error('[TierAccess] Failed to count evaluations:', error.message);
      return next(); // Fail open — don't block on db errors
    }

    if (count >= 2) {
      return res.status(403).json({
        error: 'You\'ve used your 2 free evaluations. Upgrade to Season Pass for unlimited evaluations.',
        upgradeRequired: true,
        tier: 'free',
        limit: 2,
        used: count,
      });
    }

    next();
  } catch (err) {
    console.error('[TierAccess] Evaluation limit check failed:', err.message);
    next(); // Fail open
  }
}

/**
 * Check essay analysis limits for free users.
 * Free: 1 total. Paid: unlimited.
 */
async function checkEssayLimit(req, res, next) {
  if (req.userTier && req.userTier !== 'free') {
    return next();
  }

  // For now, use the in-memory rate limit counter from essayRoutes
  // TODO: Move to database-backed counting when we add an essay_analyses table
  next();
}

/**
 * Check gap analysis limits for free users.
 * Free: 1 total. Paid: unlimited.
 */
async function checkGapLimit(req, res, next) {
  if (req.userTier && req.userTier !== 'free') {
    return next();
  }

  // For now, use the in-memory rate limit counter from gapRoutes
  // TODO: Move to database-backed counting
  next();
}

/**
 * Block free users from school list builder entirely.
 */
function checkSchoolListAccess(req, res, next) {
  if (!req.userTier || req.userTier === 'free') {
    return res.status(403).json({
      error: 'The School List Builder requires a Season Pass or Premium subscription.',
      upgradeRequired: true,
      tier: 'free',
    });
  }
  next();
}

module.exports = {
  attachTier,
  requirePaid,
  requirePremium,
  checkEvaluationLimit,
  checkEssayLimit,
  checkGapLimit,
  checkSchoolListAccess,
};
