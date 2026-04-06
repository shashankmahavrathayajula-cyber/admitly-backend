/**
 * Semantic dedupe, contradiction trimming, caps, and suggestion de-overlap for aggregated insights.
 */

const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'you', 'are', 'has', 'have', 'was', 'were',
  'not', 'but', 'can', 'may', 'any', 'all', 'one', 'our', 'their', 'they', 'them', 'into', 'also', 'more',
  'such', 'than', 'when', 'what', 'which', 'while', 'will', 'would', 'could', 'should',
]);

function wordSet(text) {
  return new Set(
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}

function overlapRatio(a, b) {
  const A = wordSet(a);
  const B = wordSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) {
    if (B.has(w)) inter += 1;
  }
  return inter / Math.min(A.size, B.size);
}

const { applyOutputGuards } = require('./outputGuards');

const SIMILAR = 0.42;
const MAX_ITEMS = 3;

/** Analyzer keys aligned with aggregator scores object */
const ANALYZER_KEYS = ['academic', 'activities', 'honors', 'narrative', 'institutionalFit'];

const DIM_KEYWORDS = {
  academic: ['gpa', 'grade', 'transcript', 'course', 'rigor', 'ap ', ' ib', 'sat', 'act', 'class', 'academic', 'school'],
  activities: ['extracurricular', 'activity', 'club', 'sport', 'volunteer', 'leadership', 'officer', 'president', 'captain', 'team'],
  honors: ['award', 'honor', 'scholar', 'recognition', 'medal', 'prize'],
  narrative: ['essay', 'personal statement', 'writing', 'story', 'voice', 'narrative', 'reflection'],
  institutionalFit: ['fit', 'major', 'campus', 'culture', 'mission', 'institution', 'university', 'program', 'computer science'],
};

/**
 * Best-effort tag of which rubric dimension(s) a line is about (for impact sorting).
 */
function inferDimensions(text) {
  const t = ` ${String(text).toLowerCase()} `;
  const hits = [];
  for (const [dim, kws] of Object.entries(DIM_KEYWORDS)) {
    if (kws.some((k) => t.includes(k))) hits.push(dim);
  }
  return hits.length ? hits : null;
}

function strengthImpact(text, dimensionScores) {
  const dims = inferDimensions(text) || ANALYZER_KEYS;
  return Math.max(...dims.map((d) => dimensionScores[d] ?? 0));
}

function weaknessImpact(text, dimensionScores) {
  const dims = inferDimensions(text) || ANALYZER_KEYS;
  return Math.max(...dims.map((d) => 10 - (dimensionScores[d] ?? 0)));
}

function suggestionImpact(text, dimensionScores) {
  const dims = inferDimensions(text) || ANALYZER_KEYS;
  return Math.max(...dims.map((d) => 10 - (dimensionScores[d] ?? 0)));
}

function sortByImpact(items, impactFn, descending) {
  return [...items].sort((a, b) => {
    const x = impactFn(a);
    const y = impactFn(b);
    return descending ? y - x : x - y;
  });
}

/**
 * Ordered dedupe: keep first occurrence (higher-priority source order already applied).
 */
function dedupeOrdered(items, similarThreshold = SIMILAR) {
  const kept = [];
  for (const text of items) {
    if (typeof text !== 'string' || !text.trim()) continue;
    const t = text.trim();
    const dup = kept.some((k) => {
      const threshold =
        wordSet(k).size < 5 && wordSet(t).size < 5 ? 0.85 : similarThreshold;
      return overlapRatio(k, t) >= threshold;
    });
    if (!dup) kept.push(t);
  }
  return kept;
}

function removeContradictions(strengths, weaknesses) {
  const s = dedupeOrdered(strengths);
  const w = [];
  for (const weak of weaknesses) {
    if (typeof weak !== 'string' || !weak.trim()) continue;
    const t = weak.trim();
    const conflicts = s.some((st) => overlapRatio(st, t) >= SIMILAR);
    if (!conflicts) w.push(t);
  }
  return { strengths: s, weaknesses: dedupeOrdered(w) };
}

/**
 * Drop suggestions that largely repeat a weakness (same fix restated).
 */
function filterSuggestionsAgainstWeaknesses(suggestions, weaknesses) {
  const w = dedupeOrdered(weaknesses);
  const out = [];
  for (const sug of suggestions) {
    if (typeof sug !== 'string' || !sug.trim()) continue;
    const t = sug.trim();
    const redundant = w.some((wk) => overlapRatio(wk, t) >= 0.55);
    if (!redundant) out.push(t);
  }
  return dedupeOrdered(out);
}

/**
 * @param {string[]} strengths
 * @param {string[]} weaknesses
 * @param {string[]} suggestions
 * @param {object|null} dimensionScores - keys: academic, activities, honors, narrative, institutionalFit (0–10)
 */
function postProcessInsights(strengths, weaknesses, suggestions, dimensionScores = null) {
  let s = dedupeOrdered(strengths);
  let w = dedupeOrdered(weaknesses);
  const fixed = removeContradictions(s, w);
  s = fixed.strengths;
  w = fixed.weaknesses;
  let su = filterSuggestionsAgainstWeaknesses(suggestions, w);
  su = dedupeOrdered(su);

  if (dimensionScores && typeof dimensionScores === 'object') {
    s = sortByImpact(s, (t) => strengthImpact(t, dimensionScores), true);
    w = sortByImpact(w, (t) => weaknessImpact(t, dimensionScores), true);
    su = sortByImpact(su, (t) => suggestionImpact(t, dimensionScores), true);
  }

  return {
    strengths: applyOutputGuards(s.slice(0, MAX_ITEMS)),
    weaknesses: applyOutputGuards(w.slice(0, MAX_ITEMS)),
    suggestions: applyOutputGuards(su.slice(0, MAX_ITEMS)),
  };
}

module.exports = {
  postProcessInsights,
  dedupeOrdered,
  overlapRatio,
  MAX_ITEMS,
};
