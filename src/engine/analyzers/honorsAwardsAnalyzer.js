const { summarizeStemAndLeadershipSignals } = require('../majorFitHelpers');
const { getBenchmarks, scoreHonors } = require('../benchmarkScoring');

function ruleBasedAnalyze(applicationProfile, universityProfile) {
  const benchmarks = getBenchmarks(universityProfile.name);
  const score = scoreHonors(applicationProfile, benchmarks);
  const honors = applicationProfile?.honors ?? applicationProfile?.awards ?? [];
  const list = Array.isArray(honors) ? honors : [];
  const strengths = [];
  const weaknesses = [];
  const suggestions = [];

  if (score >= 7.5) {
    strengths.push(`Honors and awards provide strong external validation for ${universityProfile.name}.`);
  } else if (score >= 5.5) {
    strengths.push(`Honors profile is reasonable for ${universityProfile.name}.`);
    suggestions.push('Add detail on award selectivity, level, and context to strengthen impact.');
  } else if (score >= 3.0) {
    weaknesses.push(`Honors distinction appears below the typical range seen at ${universityProfile.name}.`);
    suggestions.push('Pursue opportunities with clearer selectivity and broader recognition.');
  } else {
    weaknesses.push(`Honors profile is currently a significant gap for ${universityProfile.name}.`);
    suggestions.push('Build toward competitive distinctions and document level/prestige explicitly.');
  }

  if (list.length === 0) {
    weaknesses.push('No honors or awards were provided for evaluation.');
  }

  return {
    score: Math.max(1.0, Math.min(9.5, Math.round(score * 10) / 10)),
    strengths,
    weaknesses,
    suggestions,
  };
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
  const ruled = ruleBasedAnalyze(applicationProfile, universityProfile);
  return applyHonorsActivityGuards(ruled, applicationProfile);
}

module.exports = { analyze };
