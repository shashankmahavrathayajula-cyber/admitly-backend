const config = require('../config');
const { ANALYZERS } = require('./analyzers');
const { aggregate } = require('./aggregator');
const { computeAdmissionsSummary } = require('./admissionsSummary');
const { applySelectivityCalibration } = require('./selectivityCalibration');
const { synthesizeExecutiveInsights } = require('./insightSynthesis');
const { postProcessInsights } = require('./insightPostProcess');
const { applyStructuredInputGuards } = require('./inputConsistencyGuards');
const { normalizeApplicationInput } = require('../schemas/canonicalApplication');
const { assessCoherence } = require('./coherenceAssessment');

const log = (msg) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[EvaluationEngine] ${msg}`);
  }
};

/**
 * Evaluates one application against one university using the full analyzer pipeline.
 * @param {object} applicationProfile - Student application data
 * @param {object} universityProfile - University data from dataset
 * @param {object} [options] - { weights, verbose }
 * @returns {Promise<object>} evaluation payload; alignmentScore is selectivity-calibrated; dimension scores are raw rubric scores
 */
async function evaluate(applicationProfile, universityProfile, options = {}) {
  const verbose = options.verbose ?? process.env.NODE_ENV === 'development';
  const useAI = config.useAIAnalyzers;
  const results = {};

  const app = normalizeApplicationInput(applicationProfile);

  if (verbose) {
    console.log(`[EvaluationEngine] Evaluation started for "${universityProfile.name}" (AI mode: ${useAI})`);
  }
  for (const { key, name, fn } of ANALYZERS) {
    if (useAI && verbose) {
      console.log(`[EvaluationEngine] Running AI ${name} Analyzer`);
    } else if (verbose) {
      log(`Running ${name} Analyzer...`);
    }
    try {
      results[key] = await Promise.resolve(fn(app, universityProfile));
    } catch (err) {
      if (verbose) console.error(`[EvaluationEngine] ${name} error:`, err.message);
      results[key] = {
        score: 0,
        strengths: [],
        weaknesses: ['Analysis temporarily unavailable.'],
        suggestions: [],
      };
    }
  }

  console.log(
    '[SMOKE] Dimension scores:',
    JSON.stringify({
      academic: results.academic?.score,
      activities: results.activities?.score,
      honors: results.honors?.score,
      narrative: results.narrative?.score,
      institutionalFit: results.institutionalFit?.score,
    }),
  );

  const aggregated = aggregate(results, universityProfile);

  // Cross-dimension coherence assessment
  const coherence = assessCoherence(app, {
    academic: aggregated.academicStrength,
    activities: aggregated.activityImpact,
    honors: aggregated.honorsAwards,
    narrative: aggregated.narrativeStrength,
    institutionalFit: aggregated.institutionalFit,
  }, universityProfile);

  // Apply coherence adjustment to the raw alignment score before selectivity calibration
  const coherenceAdjustedAlignment = Math.max(1.0, Math.min(9.5,
    aggregated.alignmentScore + coherence.bonus - coherence.penalty
  ));

  // Prepend coherence feedback (it's cross-dimensional, so it goes first)
  const mergedStrengths = [...coherence.strengths, ...(aggregated.strengths || [])];
  const mergedWeaknesses = [...coherence.weaknesses, ...(aggregated.weaknesses || [])];

  const guarded = applyStructuredInputGuards({
    ...aggregated,
    strengths: mergedStrengths,
    weaknesses: mergedWeaknesses,
  }, app);
  const dimensionScores = {
    academic: aggregated.academicStrength,
    activities: aggregated.activityImpact,
    honors: aggregated.honorsAwards,
    narrative: aggregated.narrativeStrength,
    institutionalFit: aggregated.institutionalFit,
  };
  const insights = postProcessInsights(
    guarded.strengths,
    guarded.weaknesses,
    guarded.suggestions,
    dimensionScores
  );

  const merged = {
    ...aggregated,
    strengths: insights.strengths,
    weaknesses: insights.weaknesses,
    suggestions: insights.suggestions,
  };

  const executive = await synthesizeExecutiveInsights(app, universityProfile, merged);
  const calibratedAlignment = applySelectivityCalibration(coherenceAdjustedAlignment, universityProfile);
  let alignmentScore = Math.min(9.9, calibratedAlignment);
  if (calibratedAlignment >= 9.9) {
    alignmentScore = Math.min(9.9, Math.round(coherenceAdjustedAlignment * 10) / 10);
  }
  const admissionsSummary = computeAdmissionsSummary(alignmentScore, universityProfile);
  console.log('[SMOKE] Final alignmentScore:', alignmentScore, 'band:', admissionsSummary?.band);

  const result = {
    university: universityProfile.name,
    alignmentScore,
    academicStrength: aggregated.academicStrength,
    activityImpact: aggregated.activityImpact,
    honorsAwards: aggregated.honorsAwards,
    narrativeStrength: aggregated.narrativeStrength,
    institutionalFit: aggregated.institutionalFit,
    coreInsight: executive.coreInsight,
    mostImportantNextStep: executive.mostImportantNextStep,
    strengths: Array.isArray(merged.strengths) ? merged.strengths : [],
    weaknesses: Array.isArray(merged.weaknesses) ? merged.weaknesses : [],
    suggestions: Array.isArray(merged.suggestions) ? merged.suggestions : [],
    admissionsSummary,
  };

  if (!result.weaknesses || result.weaknesses.length === 0) {
    const dims = {
      'academic preparation': result.academicStrength,
      'extracurricular depth': result.activityImpact,
      'honors and recognition': result.honorsAwards,
      'essay and narrative': result.narrativeStrength,
      'institutional fit': result.institutionalFit,
    };
    const weakest = Object.entries(dims).sort((a, b) => a[1] - b[1])[0];
    result.weaknesses = [`Among your dimensions, ${weakest[0]} (${weakest[1].toFixed(1)}/10) has the most room for growth relative to ${result.university}'s expectations.`];
  }

  if (!result.suggestions || result.suggestions.length === 0) {
    result.suggestions = [`Strengthen your weakest area — even at a well-matched school, demonstrating growth in every dimension makes your application more compelling.`];
  }

  return result;
}

module.exports = {
  evaluate,
};
