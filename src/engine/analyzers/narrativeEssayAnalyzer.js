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
  const essayImportance = universityProfile.essay_importance || 'Considered';

  const hasEssay = Boolean(
    applicationProfile?.essay ?? applicationProfile?.essays ?? applicationProfile?.personalStatement ?? (applicationProfile?.narrativeThemes && applicationProfile.narrativeThemes.length > 0)
  );
  const themes = applicationProfile?.narrativeThemes ?? applicationProfile?.themes ?? [];
  const themeList = Array.isArray(themes) ? themes : [];

  let score = 5;
  const strengths = [];
  const weaknesses = [];
  const suggestions = [];

  if (hasEssay) {
    score += 2;
    strengths.push('Essay or personal statement materials indicated.');
  } else if (essayImportance === 'Very Important' || essayImportance === 'Important') {
    score -= 1;
    weaknesses.push('No essay or narrative content provided for review.');
    suggestions.push('Include essay themes or a summary for better alignment assessment.');
  }

  if (themeList.length >= 1) {
    score += 1;
    strengths.push('Narrative or thematic direction provided.');
  }

  score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));

  return { score, strengths, weaknesses, suggestions };
}

async function analyze(applicationProfile, universityProfile) {
  if (config.useAIAnalyzers) {
    const prompt = `You are an experienced university admissions officer.
Evaluate the student's narrative and essay strength for the given university.

University profile:
${JSON.stringify(universityProfile, null, 2)}

Student application (essays, personal statement, narrative themes):
${JSON.stringify(applicationProfile, null, 2)}

Consider reflection depth, thematic coherence, and fit with what the university values in essays (see culture_notes and essay_importance).
${JSON_FORMAT_INSTRUCTIONS}`;

    const result = await openaiClient.runAIAnalysis(prompt);
    if (result) return result;
  }

  return ruleBasedAnalyze(applicationProfile, universityProfile);
}

module.exports = { analyze };
