/**
 * Executive-level core insight + single next step from aggregated evaluation context.
 * AI path preferred; deterministic fallback keeps the pipeline usable without an API key.
 */

const config = require('../config');
const openaiClient = require('../utils/openaiClient');

const DIM_LABEL = {
  academic: 'academic preparation',
  activities: 'extracurricular impact',
  honors: 'honors and awards',
  narrative: 'essays and narrative',
  institutionalFit: 'institutional and major fit',
};

function spread(scores) {
  const vals = Object.values(scores);
  return Math.max(...vals) - Math.min(...vals);
}

function sortedDimensions(scores) {
  return Object.entries(scores).sort((a, b) => a[1] - b[1]);
}

function ruleBasedSynthesis(applicationProfile, universityProfile, aggregated) {
  const scores = {
    academic: aggregated.academicStrength,
    activities: aggregated.activityImpact,
    honors: aggregated.honorsAwards,
    narrative: aggregated.narrativeStrength,
    institutionalFit: aggregated.institutionalFit,
  };

  const ranked = sortedDimensions(scores);
  const [weakestKey, weakestVal] = ranked[0];
  const [strongestKey, strongestVal] = ranked[ranked.length - 1];

  const uni = universityProfile?.name || 'this college';
  const major =
    applicationProfile?.intendedMajor ??
    applicationProfile?.intended_major ??
    applicationProfile?.major ??
    '';

  let coreInsight;
  if (spread(scores) < 1.25) {
    coreInsight = `The application is evenly credible across dimensions without a sharp spike—at ${uni}, differentiation will come from specificity and proof of impact, not from one dominant stat.`;
  } else {
    coreInsight = `The file’s strongest signal is ${DIM_LABEL[strongestKey]} (${strongestVal.toFixed(1)}/10 rubric) while ${DIM_LABEL[weakestKey]} lags (${weakestVal.toFixed(1)}/10)—readers will remember that contrast.`;
  }

  if (major && typeof major === 'string' && String(major).trim()) {
    coreInsight += ` Thread ${String(major).trim()} through activities and narrative where ${uni} rewards coherence.`;
  }

  let mostImportantNextStep;
  if (aggregated.suggestions && aggregated.suggestions[0]) {
    mostImportantNextStep = aggregated.suggestions[0];
  } else if (aggregated.weaknesses && aggregated.weaknesses[0]) {
    mostImportantNextStep = `Address the largest gap (${DIM_LABEL[weakestKey]}): ${aggregated.weaknesses[0]}`;
  } else {
    mostImportantNextStep = `Build one measurable win in ${DIM_LABEL[weakestKey]}—a single outcome with scope and timeframe beats adding more thin lines elsewhere.`;
  }

  return {
    coreInsight: coreInsight.trim(),
    mostImportantNextStep: mostImportantNextStep.trim(),
  };
}

async function synthesizeExecutiveInsights(applicationProfile, universityProfile, aggregated) {
  const useAI = config.useAIAnalyzers;
  if (useAI) {
    const prompt = `You are a veteran admissions dean at a selective college. Be decisive and specific—no hedging, no "may/could/consider".

Return JSON only, no markdown:
{"coreInsight":"string 35-55 words","mostImportantNextStep":"string 15-35 words, one imperative action"}

Rules:
- coreInsight: one cross-cutting read of the WHOLE file (balance vs spike, where proof is thin, what stands out). Reference rubric themes, not GPA twice.
- mostImportantNextStep: single highest-ROI move for THIS applicant applying to THIS school—not a list.

University: ${universityProfile?.name ?? ''}
Selectivity context: ${universityProfile?.selectivity_level ?? ''}

Rubric subscores (0-10): academic ${aggregated.academicStrength}, activities ${aggregated.activityImpact}, honors ${aggregated.honorsAwards}, narrative ${aggregated.narrativeStrength}, fit ${aggregated.institutionalFit}

Prioritized strengths:
${(aggregated.strengths || []).map((s, i) => `${i + 1}. ${s}`).join('\n')}

Prioritized gaps:
${(aggregated.weaknesses || []).map((s, i) => `${i + 1}. ${s}`).join('\n')}

Ideas already surfaced (distill, do not copy verbatim):
${(aggregated.suggestions || []).map((s, i) => `${i + 1}. ${s}`).join('\n')}

Application snapshot (JSON excerpt):
${JSON.stringify(
  {
    intendedMajor: applicationProfile?.intendedMajor ?? applicationProfile?.intended_major,
    gpa: applicationProfile?.gpa ?? applicationProfile?.academics?.gpa,
    activitiesCount: Array.isArray(applicationProfile?.activities) ? applicationProfile.activities.length : undefined,
  },
  null,
  0
)}
`;

    const ai = await openaiClient.runInsightSynthesis(prompt, { maxTokens: 400 });
    if (ai && ai.coreInsight && ai.mostImportantNextStep) {
      return ai;
    }
  }

  return ruleBasedSynthesis(applicationProfile, universityProfile, aggregated);
}

module.exports = {
  synthesizeExecutiveInsights,
  ruleBasedSynthesis,
};
