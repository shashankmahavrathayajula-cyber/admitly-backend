/**
 * POST /api/analyzeEssay
 *
 * Analyzes an essay against a specific school's admissions criteria,
 * cross-referenced with the student's application profile.
 *
 * Body: {
 *   essayText: string (required, min 20 chars, max 15000 chars),
 *   universityName: string (required, must match a supported school),
 *   essayType?: string (optional, e.g. "Personal Statement", "Supplemental Essay"),
 *   application?: object (optional — student profile for cross-referencing;
 *                         if omitted, analysis proceeds without cross-referencing)
 *   force?: boolean (optional — if true, skip similarity duplicate check; daily limit still applies)
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
const { supabase } = require('../lib/supabase');

const router = express.Router();

/** Local testing only: ESSAY_DEV_NO_AUTH=1 skips JWT when NODE_ENV is not production. */
function essayAuth(req, res, next) {
  if (process.env.NODE_ENV !== 'production' && process.env.ESSAY_DEV_NO_AUTH === '1') {
    req.userId = 'dev-local-essay';
    return next();
  }
  return requireAuth(req, res, next);
}

async function checkEssayDailyLimit(userId, userTier) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('essay_analyses')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', today.toISOString());

  if (error) return { allowed: true }; // fail open

  const limit = userTier === 'premium' ? 20 : userTier === 'season_pass' ? 10 : 1;
  if (count >= limit) {
    return {
      allowed: false,
      message: `You've reached your daily essay analysis limit (${limit}/day). Your analyses reset tomorrow. This keeps Admitly fast and affordable for everyone.`,
      limit,
      used: count,
    };
  }
  return { allowed: true, remaining: limit - count };
}

async function checkEssayChanges(userId, universityName, essayType, newEssayText) {
  const resolvedType = essayType || 'Personal Statement';

  const { data: prev, error } = await supabase
    .from('essay_analyses')
    .select('result, created_at')
    .eq('user_id', userId)
    .eq('university_name', universityName)
    .eq('essay_type', resolvedType)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !prev || !prev.result) return { isDuplicate: false };

  const prevWords = new Set((prev.result.essayText || '').toLowerCase().split(/\s+/).filter(Boolean));
  const newWords = new Set(newEssayText.toLowerCase().split(/\s+/).filter(Boolean));

  if (prevWords.size === 0) return { isDuplicate: false };

  const intersection = [...newWords].filter(w => prevWords.has(w)).length;
  const similarity = intersection / Math.max(prevWords.size, newWords.size);

  if (similarity > 0.85) {
    return {
      isDuplicate: true,
      previousResult: prev.result,
      previousDate: prev.created_at,
      message:
        'Your essay is very similar to your last analysis for this school. Make more substantial revisions to get meaningful new feedback. Your previous analysis is shown below.',
    };
  }

  return { isDuplicate: false };
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
  } else if (body.essayText.length > 15000) {
    errors.push('"essayText" must be under 15,000 characters');
  }

  if (!body.universityName || typeof body.universityName !== 'string') {
    errors.push('Missing required field: "universityName" (string)');
  }

  if (body.essayType && typeof body.essayType !== 'string') {
    errors.push('"essayType" must be a string if provided');
  }

  if (body.force != null && typeof body.force !== 'boolean') {
    errors.push('"force" must be a boolean if provided');
  }

  return {
    valid: errors.length === 0,
    errors: errors.length ? errors : undefined,
  };
}

router.post('/analyzeEssay', essayAuth, attachTier, async (req, res, next) => {
  const validation = validateEssayRequest(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Validation failed', details: validation.errors });
  }

  const { essayText, universityName, essayType, application, force } = req.body;

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
    const userTier = req.userTier || 'free';

    const daily = await checkEssayDailyLimit(req.userId, userTier);
    if (!daily.allowed) {
      return res.status(429).json({
        error: daily.message,
        message: daily.message,
        limit: daily.limit,
        used: daily.used,
      });
    }

    if (force !== true) {
      const changeCheck = await checkEssayChanges(req.userId, universityName, essayType, essayText);
      if (changeCheck.isDuplicate) {
        return res.status(200).json({
          duplicate: true,
          previousResult: changeCheck.previousResult,
          previousDate: changeCheck.previousDate,
          message: changeCheck.message,
        });
      }
    }

    const result = await analyzeEssay(
      essayText,
      universityProfile,
      normalizedApp,
      { essayType: essayType || 'Personal Statement' }
    );

    if (result.error) {
      return res.status(502).json({ error: result.error, school: result.school });
    }

    const resultWithText = { ...result, essayText: essayText.substring(0, 2000) };

    saveEssayAnalysis(req.userId, universityName, essayType, resultWithText).catch(err =>
      console.error('[EssayAnalyzer] Background save failed:', err.message)
    );

    res.json(result);
  } catch (err) {
    console.error('[EssayAnalyzer] Analysis failed:', err);
    next(err);
  }
});

/**
 * Save essay analysis to Supabase for history/tracking.
 */
async function saveEssayAnalysis(userId, universityName, essayType, result) {
  try {
    if (result.error) return;
    const { error } = await supabase
      .from('essay_analyses')
      .insert({
        user_id: userId,
        university_name: universityName,
        school_name: universityName,
        essay_type: essayType || 'Personal Statement',
        result: result,
      });
    if (error) {
      console.error('[EssayAnalyzer] Save failed:', error.message);
    }
  } catch (err) {
    console.error('[EssayAnalyzer] Save failed:', err.message);
  }
}

module.exports = router;
