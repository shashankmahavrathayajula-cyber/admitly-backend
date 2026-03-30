/**
 * Reach / Target / Safety from alignment score (0–10) and institutional selectivity.
 * Heuristic only — not a prediction of admission probability.
 */

function parseAcceptanceRateFraction(estimate) {
  if (estimate == null) return null;
  const nums = String(estimate).match(/[\d.]+/g);
  if (!nums || nums.length === 0) return null;
  const values = nums.map(Number).filter((n) => !Number.isNaN(n));
  if (values.length === 0) return null;
  const avgPct = values.reduce((a, b) => a + b, 0) / values.length;
  return avgPct > 1 ? avgPct / 100 : avgPct;
}

function selectivityRank(selectivityLevel) {
  const s = String(selectivityLevel || '').toLowerCase();
  if (/most selective|highly selective|extremely selective|ivy/i.test(s)) return 3;
  if (/moderately selective|selective|competitive/i.test(s)) return 2;
  if (/less selective|accessible|open/i.test(s)) return 1;
  return 2;
}

/**
 * @param {number} alignmentScore - 0–10 weighted alignment
 * @param {object} universityProfile
 * @returns {{ band: 'reach'|'target'|'safety', reasoning: string }}
 */
function computeAdmissionsSummary(alignmentScore, universityProfile) {
  const score = typeof alignmentScore === 'number' && !Number.isNaN(alignmentScore) ? alignmentScore : 0;
  const rate = parseAcceptanceRateFraction(universityProfile?.acceptance_rate_estimate);
  const tier = selectivityRank(universityProfile?.selectivity_level);
  const name = universityProfile?.name || 'this institution';

  const highlySelective = tier >= 3 || (rate != null && rate < 0.22);

  let band;
  if (highlySelective) {
    if (score >= 8.3) band = 'target';
    else band = 'reach';
  } else if (tier >= 2 || (rate != null && rate < 0.55)) {
    if (score >= 7.8) band = 'safety';
    else if (score >= 6) band = 'target';
    else band = 'reach';
  } else {
    if (score >= 6.5) band = 'safety';
    else if (score >= 4.8) band = 'target';
    else band = 'reach';
  }

  const rateNote =
    rate != null
      ? ` ${name}'s approximate admit rate (~${Math.round(rate * 100)}%) frames how competitive a match this is.`
      : '';

  const reasoning = `Your profile scores ${score.toFixed(1)}/10 on our weighted alignment rubric for ${name}.${rateNote} Given that bar, we label this a ${band.toUpperCase()} — a rough compass for planning, not a verdict.`;

  return { band, reasoning };
}

module.exports = {
  computeAdmissionsSummary,
  parseAcceptanceRateFraction,
  selectivityRank,
};
