const express = require('express');
const evaluationService = require('../services/evaluationService');
const { validateEvaluateRequest } = require('../schemas/applicationSchema');

const router = express.Router();

/**
 * POST /api/evaluateApplication
 * Body: { application: object, universities: string[] }
 * Returns: array of { university, alignmentScore, academicStrength, activityImpact, honorsAwards, narrativeStrength, institutionalFit, strengths, weaknesses, suggestions }
 */
router.post('/evaluateApplication', async (req, res, next) => {
  const validation = validateEvaluateRequest(req.body);
  if (!validation.valid) {
    return res.status(400).json({
      error: 'Validation failed',
      details: validation.errors,
    });
  }

  const { application, universities } = req.body;
  console.log('[API] POST /api/evaluateApplication received, universities:', universities?.length ?? 0, universities ?? []);
  try {
    const results = await evaluationService.evaluateApplication(application, universities);
    res.json(results);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
