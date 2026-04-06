const express = require('express');
const evaluationService = require('../services/evaluationService');
const { validateEvaluateRequest } = require('../schemas/applicationSchema');
const config = require('../config');

const router = express.Router();

/**
 * POST /api/evaluateApplication
 * Body: { application: object, universities: string[] }
 * Returns: array of evaluation objects (scores 0–10, coreInsight, mostImportantNextStep, capped lists, optional admissionsSummary)
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
  if (config.isDevelopment) {
    console.log('REQUEST BODY:', JSON.stringify(req.body, null, 2));
  }
  console.log('[API] POST /api/evaluateApplication received, universities:', universities?.length ?? 0, universities ?? []);
  try {
    const results = await evaluationService.evaluateApplication(application, universities);
    if (config.isDevelopment) {
      console.log('FINAL EVALUATION RESULT:', JSON.stringify(results, null, 2));
    }
    res.json(results);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
