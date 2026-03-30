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

const SIMILAR = 0.42;
const MAX_ITEMS = 5;

/**
 * Ordered dedupe: keep first occurrence (higher-priority source order already applied).
 */
function dedupeOrdered(items, similarThreshold = SIMILAR) {
  const kept = [];
  for (const text of items) {
    if (typeof text !== 'string' || !text.trim()) continue;
    const t = text.trim();
    const dup = kept.some((k) => overlapRatio(k, t) >= similarThreshold);
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
 */
function postProcessInsights(strengths, weaknesses, suggestions) {
  let s = dedupeOrdered(strengths);
  let w = dedupeOrdered(weaknesses);
  const fixed = removeContradictions(s, w);
  s = fixed.strengths;
  w = fixed.weaknesses;
  let su = filterSuggestionsAgainstWeaknesses(suggestions, w);
  su = dedupeOrdered(su);

  return {
    strengths: s.slice(0, MAX_ITEMS),
    weaknesses: w.slice(0, MAX_ITEMS),
    suggestions: su.slice(0, MAX_ITEMS),
  };
}

module.exports = {
  postProcessInsights,
  dedupeOrdered,
  overlapRatio,
  MAX_ITEMS,
};
