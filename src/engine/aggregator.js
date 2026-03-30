/**
 * Combines analyzer outputs into a single evaluation result.
 * Weighted alignment score (0–10) uses university CDS-style weights when present.
 * Insights are merged with semantic dedupe, contradiction removal, and strict caps.
 */

const { postProcessInsights } = require('./insightPostProcess');

const DEFAULT_WEIGHTS = {
  academic: 0.3,
  activities: 0.25,
  honors: 0.1,
  narrative: 0.2,
  institutionalFit: 0.15,
};

const ANALYZER_KEYS = ['academic', 'activities', 'honors', 'narrative', 'institutionalFit'];

/** Priority order for tie-breaking when flattening lists (higher-signal dimensions first). */
const SOURCE_PRIORITY = ['academic', 'narrative', 'activities', 'honors', 'institutionalFit'];

function numberOr(v, fallback) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Map university evaluation_weights (gpa, course_rigor, extracurriculars, leadership, essay)
 * onto analyzer keys. Honors and fit share a small baseline slice so they still move the needle.
 */
function aggregatorWeightsFromUniversity(universityProfile) {
  const ew = universityProfile?.evaluation_weights;
  if (!ew || typeof ew !== 'object') {
    return { ...DEFAULT_WEIGHTS };
  }

  const gpa = numberOr(ew.gpa, 0.25);
  const cr = numberOr(ew.course_rigor, 0.2);
  const ex = numberOr(ew.extracurriculars, 0.15);
  const ld = numberOr(ew.leadership, 0.1);
  const essay = numberOr(ew.essay, 0.2);

  const cds = gpa + cr + ex + ld + essay;
  if (cds <= 0) {
    return { ...DEFAULT_WEIGHTS };
  }

  const coreScale = 0.88;
  const academic = ((gpa + cr) / cds) * coreScale;
  const activities = ((ex + ld) / cds) * coreScale;
  const narrative = (essay / cds) * coreScale;
  const honors = 0.06;
  const institutionalFit = 0.06;
  const total = academic + activities + narrative + honors + institutionalFit;

  return {
    academic: academic / total,
    activities: activities / total,
    honors: honors / total,
    narrative: narrative / total,
    institutionalFit: institutionalFit / total,
  };
}

function flattenField(analyzerResults, field) {
  const out = [];
  let seq = 0;
  for (const key of SOURCE_PRIORITY) {
    const arr = analyzerResults[key]?.[field];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (typeof item === 'string' && item.trim()) {
        out.push(item.trim());
        seq += 1;
      }
    }
  }
  return out;
}

/**
 * @param {object} analyzerResults - Map of analyzer key -> { score, strengths, weaknesses, suggestions }
 * @param {object} [universityProfile] - Used to derive aggregator weights from evaluation_weights
 * @returns {object} aggregated result fields
 */
function aggregate(analyzerResults, universityProfile = null) {
  const w = universityProfile ? aggregatorWeightsFromUniversity(universityProfile) : { ...DEFAULT_WEIGHTS };

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

  const rawStrengths = flattenField(analyzerResults, 'strengths');
  const rawWeaknesses = flattenField(analyzerResults, 'weaknesses');
  const rawSuggestions = flattenField(analyzerResults, 'suggestions');

  const { strengths, weaknesses, suggestions } = postProcessInsights(
    rawStrengths,
    rawWeaknesses,
    rawSuggestions
  );

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
  aggregatorWeightsFromUniversity,
};
