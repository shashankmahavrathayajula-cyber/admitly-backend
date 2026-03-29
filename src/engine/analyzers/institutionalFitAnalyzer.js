const config = require('../../config');
const openaiClient = require('../../utils/openaiClient');

const JSON_FORMAT_INSTRUCTIONS = `
Return your evaluation as valid JSON only, with no other text:
{
  "score": number from 1-10,
  "strengths": ["string", ...],
  "weaknesses": ["string", ...],
  "suggestions": ["string", ...]
}`;

function ruleBasedAnalyze(applicationProfile, universityProfile) {
  const majorStrengths = universityProfile.major_strengths || [];
  const intendedMajor = applicationProfile?.intendedMajor ?? applicationProfile?.intended_major ?? applicationProfile?.major;
  const majorStr = typeof intendedMajor === 'string' ? intendedMajor.trim().toLowerCase() : '';

  let score = 5;
  const strengths = [];
  const weaknesses = [];
  const suggestions = [];

  if (majorStr && majorStrengths.length > 0) {
    const match = majorStrengths.some((m) => m.toLowerCase().includes(majorStr) || majorStr.includes(m.toLowerCase()));
    if (match) {
      score += 2.5;
      strengths.push('Intended major aligns with institutional strengths.');
    } else {
      score += 0.5;
      suggestions.push('Highlight transferable skills; this school has strengths in other areas as well.');
    }
  }

  const cultureNotes = universityProfile.culture_notes || [];
  if (cultureNotes.length > 0) {
    score += 0.5;
  }

  score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));

  return { score, strengths, weaknesses, suggestions };
}

async function analyze(applicationProfile, universityProfile) {
  if (config.useAIAnalyzers) {
    const prompt = `You are an experienced university admissions officer.
Evaluate the student's institutional fit for the given university (major fit, culture, mission alignment).

University profile:
${JSON.stringify(universityProfile, null, 2)}

Student application (intended major, interests, values, background):
${JSON.stringify(applicationProfile, null, 2)}

Consider alignment with major_strengths, culture_notes, and the university's mission and selectivity.
${JSON_FORMAT_INSTRUCTIONS}`;

    const result = await openaiClient.runAIAnalysis(prompt);
    if (result) return result;
  }

  return ruleBasedAnalyze(applicationProfile, universityProfile);
}

module.exports = { analyze };
