/**
 * Executive-level core insight + single next step from aggregated evaluation context.
 * AI path preferred; deterministic fallback keeps the pipeline usable without an API key.
 */

const config = require('../config');
const openaiClient = require('../utils/openaiClient');
const { sliceForSynthesis } = require('./universitySlices');

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

  const syn = sliceForSynthesis(universityProfile);
  const p1 = syn.school_priorities?.[0];
  const p2 = syn.school_priorities?.[1];
  const toneClip =
    typeof syn.institutional_tone === 'string' && syn.institutional_tone.length > 0
      ? syn.institutional_tone.slice(0, 160).trim() + (syn.institutional_tone.length > 160 ? '…' : '')
      : '';

  let coreInsight;
  if (spread(scores) < 1.25) {
    coreInsight = `Rubric subscores look even, but ${uni} is not a generic review: priorities start with “${p1?.theme || 'stated factors'}” and “${p2?.theme || 'fit'}” with essay weight “${syn.essay_importance || 'unknown'}.”`;
  } else {
    coreInsight = `Strongest signal: ${DIM_LABEL[strongestKey]} (${strongestVal.toFixed(1)}/10); largest gap: ${DIM_LABEL[weakestKey]} (${weakestVal.toFixed(1)}/10). At ${uni}, align the file with “${p1?.theme || 'top priorities'}” given essay importance ${syn.essay_importance || 'unknown'}.`;
  }

  if (toneClip) {
    coreInsight += ` Reader stance (excerpt): ${toneClip}`;
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

  let outInsight = coreInsight.trim();
  if (outInsight.length > 720) {
    outInsight = `${outInsight.slice(0, 717)}…`;
  }

  return {
    coreInsight: outInsight,
    mostImportantNextStep: mostImportantNextStep.trim(),
  };
}

async function synthesizeExecutiveInsights(applicationProfile, universityProfile, aggregated) {
  const useAI = config.useAIAnalyzers;
  if (useAI) {
    const syn = sliceForSynthesis(universityProfile);
    const prompt = `You are a veteran admissions dean. Be decisive—no hedging, no "may/could/consider".

Return JSON only, no markdown:
{"coreInsight":"string 40-70 words","mostImportantNextStep":"string 18-40 words, one imperative action"}

Differentiation (critical—same applicant might apply to multiple schools):
- coreInsight MUST be impossible to reuse at a different institution without changing facts: name ${syn.name} and its location (${syn.location || 'see lens'}) when relevant.
- coreInsight MUST include BOTH: (1) the exact title text of priority #1 OR #2 from school_priorities (copy the theme string verbatim in quotes), AND (2) a 6-18 word substring copied EXACTLY from institutional_tone (also in quotation marks). If tone is empty, use two different priority theme titles instead.
- coreInsight MUST mention essay_importance (${syn.essay_importance || 'unknown'}) and what that implies for how much narrative matters here (one short clause).
- Do NOT write a paragraph that would still make sense if the school name were deleted (no all-purpose “strong applicant” filler).

Rules:
- mostImportantNextStep: One imperative for THIS school only; reference one priority theme by exact title or name the city/campus (Pullman vs Seattle) if it clarifies fit.
- Use ONLY the evidence below plus subscores—do not invent applicant facts.
- Do NOT re-hash raw GPA unless the bullets already center on academics.

Institutional lens (no full profile dump):
${JSON.stringify(syn, null, 2)}

Rubric subscores (0-10): academic ${aggregated.academicStrength}, activities ${aggregated.activityImpact}, honors ${aggregated.honorsAwards}, narrative ${aggregated.narrativeStrength}, fit ${aggregated.institutionalFit}

Prioritized strengths:
${(aggregated.strengths || []).map((s, i) => `${i + 1}. ${s}`).join('\n')}

Prioritized gaps:
${(aggregated.weaknesses || []).map((s, i) => `${i + 1}. ${s}`).join('\n')}

Ideas already surfaced (distill; do not copy):
${(aggregated.suggestions || []).map((s, i) => `${i + 1}. ${s}`).join('\n')}

Applicant one-liners (major only—do not invent details):
intended major: ${applicationProfile?.intendedMajor ?? applicationProfile?.intended_major ?? applicationProfile?.major ?? 'not specified'}
`;

    const ai = await openaiClient.runInsightSynthesis(prompt, { maxTokens: 520 });
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
