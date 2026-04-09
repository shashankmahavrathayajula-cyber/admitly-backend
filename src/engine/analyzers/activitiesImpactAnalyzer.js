const { summarizeStemAndLeadershipSignals } = require('../majorFitHelpers');
const { getBenchmarks, scoreActivities } = require('../benchmarkScoring');

function ruleBasedAnalyze(applicationProfile, universityProfile) {
  const importance = universityProfile.extracurricular_importance || 'Considered';
  const benchmarks = getBenchmarks(universityProfile.name);
  const activities = applicationProfile?.activities ?? applicationProfile?.extracurriculars ?? [];
  const list = Array.isArray(activities) ? activities : [];
  const score = scoreActivities(applicationProfile, benchmarks);
  const strengths = [];
  const weaknesses = [];
  const suggestions = [];

  const sig = summarizeStemAndLeadershipSignals(applicationProfile);
  if (score >= 7.5) {
    strengths.push(`Extracurricular profile is a strong match for expectations at ${universityProfile.name}.`);
  } else if (score >= 5.5) {
    strengths.push(`Extracurricular involvement is solid for ${universityProfile.name}.`);
    suggestions.push('Deepen impact in one or two activities with measurable outcomes and sustained ownership.');
  } else if (score >= 3.0) {
    weaknesses.push(`Extracurricular depth appears below the typical range seen at ${universityProfile.name}.`);
    suggestions.push('Prioritize sustained involvement and leadership in activities aligned with your academic direction.');
  } else {
    weaknesses.push(`Extracurricular profile is currently a major gap relative to ${universityProfile.name}.`);
    suggestions.push('Urgently build meaningful, sustained commitments with clear impact and responsibility.');
  }

  if (list.length === 0) {
    weaknesses.push('No extracurricular activities were provided for evaluation.');
  } else {
    if (sig.founderCue) {
      strengths.push('Founding/launching initiative is a high-signal indicator of ownership and initiative.');
    } else if (sig.leadershipFlag) {
      strengths.push('Leadership roles strengthen the activity narrative beyond participation alone.');
    }
    if (sig.stemCue) {
      strengths.push(`STEM-related activity signals help align profile direction with opportunities at ${universityProfile.name}.`);
    }
    if (sig.yearsHigh) {
      strengths.push('Multi-year involvement suggests sustained commitment.');
    }
  }

  if ((importance === 'Important' || importance === 'Very Important') && score < 5.5) {
    suggestions.push('Because extracurriculars are weighted heavily here, emphasize depth, leadership, and long-term commitment.');
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
