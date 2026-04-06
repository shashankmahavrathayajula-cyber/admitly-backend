const config = require('../../config');
const openaiClient = require('../../utils/openaiClient');
const toneGuidance = require('../analysisToneGuidance');
const { sliceForAcademic } = require('../universitySlices');
const { buildAcademicExcerpt } = require('../applicationExcerpt');
const { courseRigorIndicated } = require('../../schemas/canonicalApplication');
const {
  getStandardizedTestingPolicy,
  academicScoreBumpFromTests,
} = require('../academicTestScoring');

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

  const appGpa =
    applicationProfile?.gpa ?? applicationProfile?.GPA ?? applicationProfile?.academics?.gpa;
  const gpa = typeof appGpa === 'number' ? appGpa : parseFloat(appGpa);
  const hasRigor = courseRigorIndicated(applicationProfile);

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

  const testPolicy = getStandardizedTestingPolicy(universityProfile);
  const tests = applicationProfile?.tests ?? applicationProfile?.academics?.tests;
  const testBump = academicScoreBumpFromTests(tests, testPolicy);

  if (testPolicy !== 'test_blind' && testPolicy !== 'not_used') {
    if (testBump > 0) {
      score += testBump;
      strengths.push('Strong SAT/ACT corroborates the transcript (secondary to GPA and rigor).');
    } else if (testBump < 0) {
      score += testBump;
      weaknesses.push(
        'Submitted test scores are below the typical range for this institution and may weaken the academic case.'
      );
    } else if (tests?.sat || tests?.act) {
      strengths.push('Test scores on file; treated as supporting context alongside GPA and coursework.');
    } else if (testPolicy === 'test_required') {
      suggestions.push('SAT/ACT scores are part of the expected academic record at this institution when available.');
    }
  }

  score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));

  return { score, strengths, weaknesses, suggestions };
}

async function analyze(applicationProfile, universityProfile) {
  if (config.useAIAnalyzers) {
    const prompt = `You are an experienced university admissions officer.
Evaluate the student's academic preparation and strength for the given university.

University context (sliced — academic + priorities relevant to coursework):
${JSON.stringify(sliceForAcademic(universityProfile), null, 2)}

Student academic snapshot (not the full application):
${JSON.stringify(buildAcademicExcerpt(applicationProfile), null, 2)}

Consider GPA, course rigor, and fit with this university's academic expectations. If the snapshot omits GPA, say so in weaknesses.
${toneGuidance}
${JSON_FORMAT_INSTRUCTIONS}`;

    const result = await openaiClient.runAIAnalysis(prompt);
    if (result) return result;
  }

  return ruleBasedAnalyze(applicationProfile, universityProfile);
}

module.exports = { analyze };
