/**
 * Combines analyzer outputs into a single evaluation result.
 * Computes alignmentScore from weighted analyzer scores and merges strengths, weaknesses, suggestions.
 */

const DEFAULT_WEIGHTS = {
  academic: 0.3,
  activities: 0.25,
  honors: 0.1,
  narrative: 0.2,
  institutionalFit: 0.15,
};

const ANALYZER_KEYS = ['academic', 'activities', 'honors', 'narrative', 'institutionalFit'];

function uniqueMerge(arrays) {
  const set = new Set();
  for (const arr of arrays) {
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (typeof item === 'string' && item.trim()) set.add(item.trim());
      }
    }
  }
  return [...set];
}

/**
 * @param {object} analyzerResults - Map of analyzer key -> { score, strengths, weaknesses, suggestions }
 * @param {object} [weights] - Optional weights (default DEFAULT_WEIGHTS)
 * @returns {object} { alignmentScore, academicStrength, activityImpact, honorsAwards, narrativeStrength, institutionalFit, strengths, weaknesses, suggestions }
 */
function aggregate(analyzerResults, weights = DEFAULT_WEIGHTS) {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  let weightedSum = 0;
  let weightSum = 0;
  const scores = {};

  for (const key of ANALYZER_KEYS) {
    const result = analyzerResults[key];
    const score = result && typeof result.score === 'number' ? result.score : 0;
    const weight = w[key] ?? 0;
    scores[key] = score;
    weightedSum += score * weight;
    weightSum += weight;
  }

  const alignmentScore = weightSum > 0 ? Math.round((weightedSum / weightSum) * 10) / 10 : 0;

  const strengths = uniqueMerge(ANALYZER_KEYS.map((k) => analyzerResults[k]?.strengths).filter(Boolean));
  const weaknesses = uniqueMerge(ANALYZER_KEYS.map((k) => analyzerResults[k]?.weaknesses).filter(Boolean));
  const suggestions = uniqueMerge(ANALYZER_KEYS.map((k) => analyzerResults[k]?.suggestions).filter(Boolean));

  return {
    alignmentScore,
    academicStrength: scores.academic ?? 0,
    activityImpact: scores.activities ?? 0,
    honorsAwards: scores.honors ?? 0,
    narrativeStrength: scores.narrative ?? 0,
    institutionalFit: scores.institutionalFit ?? 0,
    strengths,
    weaknesses,
    suggestions,
  };
}

module.exports = {
  aggregate,
  DEFAULT_WEIGHTS,
  ANALYZER_KEYS,
};
