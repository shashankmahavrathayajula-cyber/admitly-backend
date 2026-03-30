const config = require('../config');
const { ANALYZERS } = require('./analyzers');
const { aggregate } = require('./aggregator');
const { computeAdmissionsSummary } = require('./admissionsSummary');

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
 * @returns {Promise<object>} evaluation payload including admissionsSummary (band + reasoning)
 */
async function evaluate(applicationProfile, universityProfile, options = {}) {
  const verbose = options.verbose ?? process.env.NODE_ENV === 'development';
  const useAI = config.useAIAnalyzers;
  const results = {};

  console.log(`[EvaluationEngine] Evaluation started for "${universityProfile.name}" (AI mode: ${useAI})`);
  for (const { key, name, fn } of ANALYZERS) {
    if (useAI) {
      console.log(`[EvaluationEngine] Running AI ${name} Analyzer`);
    } else if (verbose) {
      log(`Running ${name} Analyzer...`);
    }
    try {
      results[key] = await Promise.resolve(fn(applicationProfile, universityProfile));
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
  const admissionsSummary = computeAdmissionsSummary(aggregated.alignmentScore, universityProfile);

  return {
    university: universityProfile.name,
    alignmentScore: aggregated.alignmentScore,
    academicStrength: aggregated.academicStrength,
    activityImpact: aggregated.activityImpact,
    honorsAwards: aggregated.honorsAwards,
    narrativeStrength: aggregated.narrativeStrength,
    institutionalFit: aggregated.institutionalFit,
    strengths: Array.isArray(aggregated.strengths) ? aggregated.strengths : [],
    weaknesses: Array.isArray(aggregated.weaknesses) ? aggregated.weaknesses : [],
    suggestions: Array.isArray(aggregated.suggestions) ? aggregated.suggestions : [],
    admissionsSummary,
  };
}

module.exports = {
  evaluate,
};
