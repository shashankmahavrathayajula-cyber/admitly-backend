const config = require('../config');
const { ANALYZERS } = require('./analyzers');
const { aggregate } = require('./aggregator');
const { computeAdmissionsSummary } = require('./admissionsSummary');
const { applySelectivityCalibration } = require('./selectivityCalibration');
const { synthesizeExecutiveInsights } = require('./insightSynthesis');
const { postProcessInsights } = require('./insightPostProcess');
const { applyStructuredInputGuards } = require('./inputConsistencyGuards');
const { normalizeApplicationInput } = require('../schemas/canonicalApplication');

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

  const aggregated = aggregate(results, universityProfile);

  const guarded = applyStructuredInputGuards(aggregated, app);
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
  const alignmentScore = applySelectivityCalibration(aggregated.alignmentScore, universityProfile);
  const admissionsSummary = computeAdmissionsSummary(alignmentScore, universityProfile);

  return {
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
}

module.exports = {
  evaluate,
};
