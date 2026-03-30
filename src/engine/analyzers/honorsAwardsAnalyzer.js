const config = require('../../config');
const openaiClient = require('../../utils/openaiClient');
const toneGuidance = require('../analysisToneGuidance');

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

async function analyze(applicationProfile, universityProfile) {
  if (config.useAIAnalyzers) {
    const prompt = `You are an experienced university admissions officer.
Evaluate the student's honors and awards for the given university.

University profile:
${JSON.stringify(universityProfile, null, 2)}

Student application (honors, awards, recognition):
${JSON.stringify(applicationProfile, null, 2)}

Consider prestige, relevance to the institution, and how they strengthen the application.
${toneGuidance}
${JSON_FORMAT_INSTRUCTIONS}`;

    const result = await openaiClient.runAIAnalysis(prompt);
    if (result) return result;
  }

  return ruleBasedAnalyze(applicationProfile, universityProfile);
}

module.exports = { analyze };
