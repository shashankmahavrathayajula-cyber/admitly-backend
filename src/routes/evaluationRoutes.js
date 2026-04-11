const express = require('express');
const evaluationService = require('../services/evaluationService');
const { validateEvaluateRequest } = require('../schemas/applicationSchema');
const { requireAuth } = require('../middleware/requireAuth');
const { attachTier, checkEvaluationLimit } = require('../middleware/tierAccess');
const { rateLimit } = require('../middleware/rateLimit');
const { saveEvaluation } = require('../services/evaluationStorage');
const config = require('../config');

const router = express.Router();

/**
 * POST /api/evaluateApplication
 * Body: { application: object, universities: string[] }
 * Returns: array of evaluation objects (scores 0–10, coreInsight, mostImportantNextStep, capped lists, optional admissionsSummary)
 */
router.post('/evaluateApplication', requireAuth, attachTier, checkEvaluationLimit, rateLimit, async (req, res, next) => {
  const validation = validateEvaluateRequest(req.body);
  if (!validation.valid) {
    return res.status(400).json({
      error: 'Validation failed',
      details: validation.errors,
    });
  }

  const { application, universities } = req.body;

  // Validate payload (limits and shape)
  if (!application || typeof application !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid "application" field' });
  }
  if (!universities || !Array.isArray(universities) || universities.length === 0) {
    return res.status(400).json({ error: 'Missing or invalid "universities" field' });
  }
  if (universities.length > 5) {
    return res.status(400).json({ error: 'Maximum 5 universities per evaluation' });
  }

  const activities = application.activities || application.extracurriculars || [];
  if (Array.isArray(activities) && activities.length > 15) {
    return res.status(400).json({ error: 'Maximum 15 activities allowed' });
  }

  const honors = application.honors || application.awards || [];
  if (Array.isArray(honors) && honors.length > 15) {
    return res.status(400).json({ error: 'Maximum 15 honors allowed' });
  }

  const essay = application.essays?.personalStatement || application.personalStatement || application.essay || '';
  if (typeof essay === 'string' && essay.length > 15000) {
    return res.status(400).json({ error: 'Essay text exceeds maximum length (15,000 characters)' });
  }

  if (config.isDevelopment) {
    console.log('REQUEST BODY:', JSON.stringify(req.body, null, 2));
  }
  console.log('[SMOKE] Raw request body academics:', JSON.stringify(req.body.application?.academics));
  console.log(
    '[SMOKE] Raw apCoursesTaken:',
    req.body.application?.apCoursesTaken,
    'apCoursesAvailable:',
    req.body.application?.apCoursesAvailable,
  );
  console.log('[API] POST /api/evaluateApplication received, universities:', universities?.length ?? 0, universities ?? []);
  try {
    const results = await evaluationService.evaluateApplication(application, universities);
    if (config.isDevelopment) {
      console.log('FINAL EVALUATION RESULT:', JSON.stringify(results, null, 2));
    }
    saveEvaluation(req.userId, req.body.application, req.body.universities, results)
      .catch(err => console.error('[Storage] Background save failed:', err));
    res.json(results);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
