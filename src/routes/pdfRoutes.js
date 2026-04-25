const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { attachTier, requirePremium } = require('../middleware/tierAccess');
const { generateCounselorPDF } = require('../services/pdfGenerator');
const { generateDiscussionGuide } = require('../engine/counselorQuestions');

const router = express.Router();

/**
 * POST /api/counselor-pdf
 * Body: { studentName, profile, evaluations, essayAnalyses }
 * Returns: application/pdf
 */
router.post('/counselor-pdf', requireAuth, attachTier, requirePremium, async (req, res, next) => {
  try {
    const { studentName, profile, evaluations, essayAnalyses = [] } = req.body;

    if (!studentName || typeof studentName !== 'string') {
      return res.status(400).json({ error: 'studentName is required' });
    }
    if (!profile || typeof profile !== 'object') {
      return res.status(400).json({ error: 'profile is required' });
    }
    if (!evaluations || !Array.isArray(evaluations) || evaluations.length === 0) {
      return res.status(400).json({ error: 'At least one evaluation result is required. Run an evaluation first.' });
    }
    if (evaluations.length > 5) {
      return res.status(400).json({ error: 'Maximum 5 school evaluations per PDF' });
    }

    for (const evaluation of evaluations) {
      const scores = [
        evaluation.alignmentScore,
        evaluation.academicStrength,
        evaluation.activityImpact,
        evaluation.honorsAwards,
        evaluation.narrativeStrength,
        evaluation.institutionalFit,
      ];
      for (const score of scores) {
        if (typeof score !== 'number' || score < 0 || score > 10) {
          return res.status(400).json({ error: `Invalid score value: ${score}. All scores must be 0-10.` });
        }
      }
    }

    console.log(`[PDF] Generating counselor PDF for ${studentName}, ${evaluations.length} schools`);

    const profileForLlm = { ...profile, studentName: profile.studentName || studentName };
    const discussionGuide = await generateDiscussionGuide(evaluations, essayAnalyses, profileForLlm);

    const pdfBuffer = await generateCounselorPDF({
      studentName,
      generatedDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      profile,
      evaluations,
      essayAnalyses,
      discussionGuide,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Admitly-Counselor-Summary-${studentName.replace(/\s+/g, '-')}.pdf"`
    );
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[PDF] Generation failed:', err.message);
    next(err);
  }
});

module.exports = router;
