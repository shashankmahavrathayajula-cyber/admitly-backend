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
  const weights = universityProfile.evaluation_weights || {};

  const appGpa = applicationProfile?.gpa ?? applicationProfile?.GPA;
  const gpa = typeof appGpa === 'number' ? appGpa : parseFloat(appGpa);
  const hasRigor = Boolean(applicationProfile?.courseRigor ?? applicationProfile?.course_rigor ?? applicationProfile?.apCourses ?? applicationProfile?.honorsCourses);

  let score = 5;
  const strengths = [];
  const weaknesses = [];
  const suggestions = [];

  if (typeof gpa === 'number' && !Number.isNaN(gpa)) {
    if (gpa >= 3.8) {
      score += 3;
      strengths.push('Strong GPA relative to competitive admissions.');
    } else if (gpa >= 3.5) {
      score += 1.5;
      strengths.push('Solid academic GPA.');
    } else if (gpa < 3.0) {
      score -= 2;
      weaknesses.push('GPA may be below typical range for this institution.');
      suggestions.push('Highlight upward trend or context in additional materials if applicable.');
    }
  } else {
    weaknesses.push('No GPA provided for evaluation.');
    suggestions.push('Include GPA or equivalent academic metrics for a more accurate assessment.');
  }

  if (hasRigor) {
    score += 1;
    strengths.push('Course rigor (AP/honors/advanced coursework) indicated.');
  } else {
    suggestions.push('Consider highlighting advanced or rigorous coursework if applicable.');
  }

  score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));

  return { score, strengths, weaknesses, suggestions };
}

async function analyze(applicationProfile, universityProfile) {
  if (config.useAIAnalyzers) {
    const prompt = `You are an experienced university admissions officer.
Evaluate the student's academic preparation and strength for the given university.

University profile:
${JSON.stringify(universityProfile, null, 2)}

Student application (academic-related):
${JSON.stringify(applicationProfile, null, 2)}

Consider GPA, course rigor, test scores if mentioned, and fit with the university's academic expectations.
${JSON_FORMAT_INSTRUCTIONS}`;

    const result = await openaiClient.runAIAnalysis(prompt);
    if (result) return result;
  }

  return ruleBasedAnalyze(applicationProfile, universityProfile);
}

module.exports = { analyze };
