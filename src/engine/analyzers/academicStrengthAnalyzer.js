const { courseRigorIndicated } = require('../../schemas/canonicalApplication');
const { getBenchmarks, scoreAcademic } = require('../benchmarkScoring');
const {
  getStandardizedTestingPolicy,
  academicScoreBumpFromTests,
} = require('../academicTestScoring');

function ruleBasedAnalyze(applicationProfile, universityProfile) {
  const benchmarks = getBenchmarks(universityProfile.name);
  const score = scoreAcademic(applicationProfile, benchmarks);
  const hasRigor = courseRigorIndicated(applicationProfile);
  const strengths = [];
  const weaknesses = [];
  const suggestions = [];

  if (score >= 7.5) {
    strengths.push(`Academic profile is strong and aligns well with typical expectations at ${universityProfile.name}.`);
    if (hasRigor) strengths.push('Course rigor is clearly indicated, reinforcing readiness for advanced coursework.');
  } else if (score >= 5.5) {
    strengths.push(`Academic preparation appears solid for ${universityProfile.name}, with room to sharpen the strongest signals.`);
    suggestions.push(
      hasRigor
        ? 'Improve or better contextualize GPA consistency to strengthen the academic case.'
        : 'Add clearer evidence of rigorous coursework (AP/IB/honors/advanced classes) to improve academic positioning.'
    );
  } else if (score >= 3.0) {
    weaknesses.push(`Academic profile appears below the typical range expected at ${universityProfile.name}.`);
    suggestions.push(
      hasRigor
        ? 'Prioritize raising classroom performance and provide context for lower grades where relevant.'
        : 'Build a stronger academic baseline with sustained grades and clearly documented rigorous coursework.'
    );
  } else {
    weaknesses.push(`There is a significant academic gap relative to ${universityProfile.name}'s typical expectations.`);
    suggestions.push(
      hasRigor
        ? 'Urgently improve core academic performance and present concrete evidence of readiness in high-level coursework.'
        : 'Urgently strengthen both grades and course rigor; the current academic profile is unlikely to be competitive.'
    );
  }

  const testPolicy = getStandardizedTestingPolicy(universityProfile);
  const tests = applicationProfile?.tests ?? applicationProfile?.academics?.tests;
  const testBump = academicScoreBumpFromTests(tests, testPolicy);

  if (testPolicy !== 'test_blind' && testPolicy !== 'not_used') {
    if (testBump > 0) {
      strengths.push('Strong SAT/ACT corroborates the transcript (secondary to GPA and rigor).');
    } else if (testBump < 0) {
      weaknesses.push(
        'Submitted test scores are below the typical range for this institution and may weaken the academic case.'
      );
    } else if (tests?.sat || tests?.act) {
      strengths.push('Test scores on file; treated as supporting context alongside GPA and coursework.');
    } else if (testPolicy === 'test_required') {
      suggestions.push('SAT/ACT scores are part of the expected academic record at this institution when available.');
    }
  }

  return {
    score: Math.max(1.0, Math.min(9.5, Math.round(score * 10) / 10)),
    strengths,
    weaknesses,
    suggestions,
  };
}

async function analyze(applicationProfile, universityProfile) {
  return ruleBasedAnalyze(applicationProfile, universityProfile);
}

module.exports = { analyze };
