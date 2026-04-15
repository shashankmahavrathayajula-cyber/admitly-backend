/**
 * Tier-based access control middleware.
 *
 * Checks the user's subscription tier and enforces feature limits.
 * Attaches req.userTier to the request for downstream use.
 *
 * Free tier limits:
 * - 2 school evaluations total (counted via evaluation_results per user)
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
      limit: 0,
      used: 0,
      remaining: 0,
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
      limit: 0,
      used: 0,
      remaining: 0,
    });
  }
  next();
}

const FREE_EVALUATION_LIMIT = 2;

/**
 * Check evaluation limits for free users.
 * Free: 2 school evaluations total (rows in evaluation_results for this user). Paid: unlimited.
 * Trims req.body.universities when the batch would exceed remaining slots.
 */
async function checkEvaluationLimit(req, res, next) {
  if (req.userTier && req.userTier !== 'free') {
    return next(); // Paid users: no limit (before any DB work)
  }

  const universitiesRaw = req.body?.universities;
  const requestedCount = Array.isArray(universitiesRaw) ? universitiesRaw.length : 0;

  try {
    const { data: evalRows, error: listError } = await supabase
      .from('evaluations')
      .select('id')
      .eq('user_id', req.userId);

    if (listError) {
      console.warn('[TierAccess] Failed to list evaluations for limit check:', listError.message);
      return next(); // Fail open — don't block on db errors
    }

    const evalIds = (evalRows || []).map(r => r.id).filter(Boolean);
    let used = 0;

    if (evalIds.length > 0) {
      const { count: resultCount, error: countError } = await supabase
        .from('evaluation_results')
        .select('*', { count: 'exact', head: true })
        .in('evaluation_id', evalIds);

      if (countError) {
        console.warn('[TierAccess] Failed to count evaluation_results:', countError.message);
        return next(); // Fail open
      }
      used = resultCount ?? 0;
    }

    const remainingSlots = FREE_EVALUATION_LIMIT - used;

    if (remainingSlots <= 0) {
      return res.status(403).json({
        error: 'You\'ve used all 2 of your free evaluations. Upgrade to Season Pass for unlimited evaluations.',
        upgradeRequired: true,
        tier: 'free',
        limit: FREE_EVALUATION_LIMIT,
        used,
        remaining: 0,
      });
    }

    if (requestedCount > remainingSlots) {
      if (Array.isArray(req.body.universities)) {
        req.body.universities = req.body.universities.slice(0, remainingSlots);
      }
      req.evaluationLimitNote =
        `You selected ${requestedCount} schools but only had ${remainingSlots} free evaluation(s) remaining. We evaluated your first ${remainingSlots} school(s). Upgrade to Season Pass for unlimited evaluations.`;
    }

    next();
  } catch (err) {
    console.warn('[TierAccess] Evaluation limit check failed:', err.message);
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
      limit: 0,
      used: 0,
      remaining: 0,
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
