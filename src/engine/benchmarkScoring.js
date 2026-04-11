/**
 * Benchmark-anchored scoring utility.
 *
 * Instead of "start at 5 and add/subtract points," each dimension compares
 * the student against school-specific anchors (strong/average/weak) and
 * interpolates a score.
 *
 * Score bands:
 *   Exceeds strong  → 8.5–9.5
 *   Meets strong     → 7.5–8.5
 *   Between avg–strong → 5.5–7.5
 *   Meets average    → 4.5–5.5
 *   Between weak–avg → 3.0–4.5
 *   Meets weak       → 2.0–3.0
 *   Below weak       → 1.0–2.0
 */

const benchmarksData = require('../../data/benchmarks.json');

/**
 * Get benchmarks for a school by name.
 * Falls back to a mid-tier default if the school isn't found.
 */
function getBenchmarks(universityName) {
  return benchmarksData[universityName] || benchmarksData['University of Washington'];
}

/**
 * Linear interpolation between two values.
 */
function lerp(low, high, t) {
  return low + (high - low) * Math.max(0, Math.min(1, t));
}

/**
 * Map a rigor string to a numeric value for comparison.
 */
function rigorLevel(rigor) {
  const map = {
    'most_demanding': 4,
    'ap_ib': 3,
    'honors': 2,
    'standard': 1,
    '': 0,
  };
  return map[String(rigor || '').toLowerCase()] ?? 0;
}

function coerceNonNegativeInt(val) {
  if (val == null || val === '') return null;
  const n = typeof val === 'number' ? val : parseInt(String(val).trim(), 10);
  if (Number.isNaN(n) || n < 0) return null;
  return n;
}

function computeRigorFromCourses(profile) {
  const taken = coerceNonNegativeInt(profile.apCoursesTaken ?? profile.academics?.apCoursesTaken);
  const available = coerceNonNegativeInt(profile.apCoursesAvailable ?? profile.academics?.apCoursesAvailable);

  if (taken != null && taken >= 0) {
    if (typeof available === 'number' && available > 0) {
      const ratio = taken / available;
      if (ratio >= 0.7) return 'most_demanding';
      if (ratio >= 0.4) return 'ap_ib';
      if (ratio >= 0.2) return 'honors';
      return 'standard';
    }
    if (taken >= 6) return 'most_demanding';
    if (taken >= 3) return 'ap_ib';
    if (taken >= 1) return 'honors';
    return 'standard';
  }
  return null;
}

/**
 * Score a single numeric value against strong/average/weak thresholds.
 * Returns 1.0–9.5 based on where the value falls.
 */
function scoreAgainstThresholds(value, strong, average, weak) {
  if (value == null || isNaN(value)) return 1.5;

  if (value >= strong) {
    // Between strong and ceiling
    const excess = (value - strong) / Math.max(strong * 0.05, 0.3);
    return lerp(8.0, 9.5, Math.min(excess, 1));
  }
  if (value >= average) {
    const t = (value - average) / (strong - average || 1);
    return lerp(5.5, 8.0, t);
  }
  if (value >= weak) {
    const t = (value - weak) / (average - weak || 1);
    return lerp(3.0, 5.5, t);
  }
  // Below weak
  const deficit = (weak - value) / (weak * 0.3 || 1);
  return lerp(3.0, 1.0, Math.min(deficit, 1));
}

/**
 * Score academic dimension against school benchmarks.
 */
function scoreAcademic(profile, benchmarks) {
  const b = benchmarks.academic;
  if (!b) return 5;

  const gpa = profile.gpa ?? profile.academics?.gpa;
  const computedRigor = computeRigorFromCourses(profile);
  const rigor = computedRigor || profile.courseRigor || profile.academics?.courseRigor || '';
  const tests = profile.tests ?? profile.academics?.tests;
  const sat = tests?.sat;
  const act = tests?.act;

  // GPA score (primary signal — 50% weight)
  const gpaScore = scoreAgainstThresholds(
    gpa,
    b.strong.gpa_min,
    b.average.gpa_min,
    b.weak.gpa_min
  );

  // Rigor score (30% weight)
  const studentRigor = rigorLevel(rigor);
  const strongRigor = rigorLevel(b.strong.rigor);
  const avgRigor = rigorLevel(b.average.rigor);
  const weakRigor = rigorLevel(b.weak.rigor);
  const rigorScore = scoreAgainstThresholds(studentRigor, strongRigor, avgRigor, weakRigor);

  // Test score (20% weight — only if school uses tests and student has scores)
  let testScore = null;
  if (b.strong.sat_min && sat) {
    testScore = scoreAgainstThresholds(sat, b.strong.sat_min, b.average.sat_min, b.weak.sat_min);
  } else if (b.strong.act_min && act) {
    testScore = scoreAgainstThresholds(act, b.strong.act_min, b.average.act_min, b.weak.act_min);
  }

  let finalScore;
  if (testScore !== null) {
    finalScore = gpaScore * 0.50 + rigorScore * 0.30 + testScore * 0.20;
  } else {
    // No test data — redistribute weight to GPA and rigor
    finalScore = gpaScore * 0.60 + rigorScore * 0.40;
  }

  return Math.max(1.0, Math.min(9.5, Math.round(finalScore * 10) / 10));
}

/**
 * Score activities dimension against school benchmarks.
 */
function scoreActivities(profile, benchmarks) {
  const b = benchmarks.activities;
  if (!b) return 5;

  const activities = profile.activities ?? profile.extracurriculars ?? [];
  const list = Array.isArray(activities) ? activities : [];

  if (list.length === 0) return 1.5;

  const count = list.length;
  const leadershipCount = list.filter(a =>
    a.isLeadership ||
    /president|captain|founder|lead|director|officer|chair|head/i.test(String(a.role || ''))
  ).length;
  const avgYears = list.reduce((sum, a) => sum + (a.yearsActive || a.years || 1), 0) / list.length;
  const hasFounderOrNational = list.some(a =>
    /founder|started|created|launched/i.test(String(a.role || '') + ' ' + String(a.description || ''))
  );

  // Count score (40% weight)
  const countScore = scoreAgainstThresholds(count, b.strong.count_min, b.average.count_min, b.weak.count_min);

  // Leadership score (30% weight)
  const leaderScore = scoreAgainstThresholds(
    leadershipCount,
    b.strong.leadership_min,
    b.average.leadership_min,
    b.weak.leadership_min
  );

  // Commitment score (20% weight)
  const yearsScore = scoreAgainstThresholds(
    avgYears,
    b.strong.avg_years_min,
    b.average.avg_years_min,
    b.weak.avg_years_min
  );

  // Depth bonus (10% weight)
  const depthBonus = hasFounderOrNational && b.strong.founder_or_national ? 9.0 : 5.0;

  const finalScore = countScore * 0.40 + leaderScore * 0.30 + yearsScore * 0.20 + depthBonus * 0.10;
  return Math.max(1.0, Math.min(9.5, Math.round(finalScore * 10) / 10));
}

/**
 * Score honors dimension against school benchmarks.
 */
function scoreHonors(profile, benchmarks) {
  const b = benchmarks.honors;
  if (!b) return 5;

  const honors = profile.honors ?? profile.awards ?? [];
  const list = Array.isArray(honors) ? honors : [];

  if (list.length === 0) return 1.5;

  const count = list.length;
  const nationalOrIntl = list.filter(h =>
    /national|international/i.test(String(h.level || ''))
  ).length;

  // Count score (60% weight)
  const countScore = scoreAgainstThresholds(count, b.strong.count_min, b.average.count_min, b.weak.count_min);

  // Prestige score (40% weight)
  const prestigeScore = scoreAgainstThresholds(
    nationalOrIntl,
    b.strong.national_or_international_min,
    b.average.national_or_international_min,
    b.weak.national_or_international_min
  );

  const finalScore = countScore * 0.60 + prestigeScore * 0.40;
  return Math.max(1.0, Math.min(9.5, Math.round(finalScore * 10) / 10));
}

/**
 * Score narrative dimension using word count as quality proxy (rule-based mode).
 * AI mode handles this separately with real essay analysis.
 */
function scoreNarrative(profile, benchmarks) {
  const b = benchmarks.narrative;
  if (!b) return 5;

  // Extract essay text
  let essayText = '';
  const essays = profile.essays;
  if (typeof profile.essay === 'string') essayText = profile.essay;
  else if (typeof profile.personalStatement === 'string') essayText = profile.personalStatement;
  else if (essays?.personalStatement) essayText = essays.personalStatement;

  const text = essayText.trim();
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  if (wordCount === 0) return 1.5;

  // Word count score (40% weight)
  const wcScore = scoreAgainstThresholds(wordCount, b.strong_word_min, b.average_word_min, b.weak_word_min);

  // Specificity signals (30% weight) — proxy for essay quality
  const hasNumbers = /\d{2,}/.test(text);
  const hasProperNouns = /[A-Z][a-z]{2,}/.test(text.slice(1));
  const hasConcreteDetail = /\b(built|created|designed|organized|led|founded|published|taught|spent|learned)\b/i.test(text);
  const hasReflection = /\b(realized|understood|changed|shaped|taught me|learned that|made me)\b/i.test(text);
  const hasSchoolRef = profile.intendedMajor || /\b(university|college|program|department|major)\b/i.test(text);

  let specificityHits = 0;
  if (hasNumbers) specificityHits++;
  if (hasProperNouns) specificityHits++;
  if (hasConcreteDetail) specificityHits++;
  if (hasReflection) specificityHits++;
  if (hasSchoolRef) specificityHits++;

  // 0 hits = 2.0, 1 = 4.0, 2 = 5.5, 3 = 7.0, 4 = 8.0, 5 = 9.0
  const specificityScore = Math.min(9.0, 2.0 + specificityHits * 1.5);

  // Sentence variety (15% weight) — longer sentences + shorter sentences = better writing
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgSentenceLen = sentences.length > 0 ? words.length / sentences.length : 0;
  let varietyScore = 5.0;
  if (avgSentenceLen >= 10 && avgSentenceLen <= 25 && sentences.length >= 3) varietyScore = 7.5;
  else if (sentences.length >= 2) varietyScore = 5.5;
  else varietyScore = 3.0;

  // Vocabulary richness (15% weight) — unique words / total words
  const uniqueWords = new Set(words.map(w => w.toLowerCase())).size;
  const richness = wordCount > 0 ? uniqueWords / wordCount : 0;
  let richnessScore = 5.0;
  if (richness >= 0.65) richnessScore = 8.0;
  else if (richness >= 0.55) richnessScore = 6.5;
  else if (richness >= 0.45) richnessScore = 5.0;
  else richnessScore = 3.5;

  const rawScore = wcScore * 0.40 + specificityScore * 0.30 + varietyScore * 0.15 + richnessScore * 0.15;

  // Apply essay importance multiplier
  const multiplier = b.essay_importance_multiplier || 1.0;
  const adjusted = 5.0 + (rawScore - 5.0) * multiplier;

  return Math.max(1.0, Math.min(9.5, Math.round(adjusted * 10) / 10));
}

module.exports = {
  getBenchmarks,
  scoreAcademic,
  scoreActivities,
  scoreHonors,
  scoreNarrative,
  scoreAgainstThresholds,
  computeRigorFromCourses,
  rigorLevel,
  lerp,
};
