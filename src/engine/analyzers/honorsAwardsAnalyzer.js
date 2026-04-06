const config = require('../../config');
const openaiClient = require('../../utils/openaiClient');
const toneGuidance = require('../analysisToneGuidance');
const { sliceForHonors } = require('../universitySlices');
const { buildHonorsExcerpt } = require('../applicationExcerpt');
const { summarizeStemAndLeadershipSignals } = require('../majorFitHelpers');

const JSON_FORMAT_INSTRUCTIONS = `
Return your evaluation as valid JSON only, with no other text:
{
  "score": number from 1-10,
  "strengths": ["string", ...],
  "weaknesses": ["string", ...],
  "suggestions": ["string", ...]
}`;

function ruleBasedAnalyze(applicationProfile, universityProfile) {
  const honors = applicationProfile?.honors ?? applicationProfile?.awards ?? [];
  const list = Array.isArray(honors) ? honors : [];

  let score = 5;
  const strengths = [];
  const weaknesses = [];
  const suggestions = [];

  if (list.length >= 2) {
    score += 2;
    strengths.push('Multiple honors or awards strengthen the profile.');
  } else if (list.length === 1) {
    score += 1;
    strengths.push('Honors or awards noted.');
  } else {
    score -= 0.5;
    weaknesses.push('No honors or awards listed.');
    suggestions.push('Include any academic, leadership, or community awards if applicable.');
  }

  score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));

  return { score, strengths, weaknesses, suggestions };
}

function applyHonorsActivityGuards(result, applicationProfile) {
  if (!result || typeof result !== 'object') return result;
  const sig = summarizeStemAndLeadershipSignals(applicationProfile);
  if (!sig.founderCue && !sig.leadershipFlag) return result;
  const weaknesses = (result.weaknesses || []).filter(
    (w) => !/\bno\s+evidence\s+of\s+sustained\s+leadership\b/i.test(String(w))
  );
  return { ...result, weaknesses };
}

async function analyze(applicationProfile, universityProfile) {
  if (config.useAIAnalyzers) {
    const prompt = `You are an experienced university admissions officer.
Evaluate the student's honors and awards for the given university.

University context:
${JSON.stringify(sliceForHonors(universityProfile), null, 2)}

Student honors snapshot:
${JSON.stringify(buildHonorsExcerpt(applicationProfile), null, 2)}

Honors-only scope: leadership claims belong in activities; do not claim "no sustained leadership" if extracurriculars likely include officer/founder roles (not visible in this honors list).
Consider prestige, relevance to this institution's priorities, and how awards strengthen the overall story.
${toneGuidance}
${JSON_FORMAT_INSTRUCTIONS}`;

    const result = await openaiClient.runAIAnalysis(prompt);
    if (result) return applyHonorsActivityGuards(result, applicationProfile);
  }

  return ruleBasedAnalyze(applicationProfile, universityProfile);
}

module.exports = { analyze };
