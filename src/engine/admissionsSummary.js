/**
 * Reach / Target / Safety from competitiveness-adjusted alignment and institutional context.
 * Heuristic only — not a prediction of admission probability.
 */

const {
  parseAcceptanceRateFraction,
  selectivityRank,
  effectiveAdmitRate,
} = require('./universitySignals');

/**
 * Band thresholds move with admit context: stricter "safety" at selective schools.
 */
function bandThresholds(rate) {
  const r = typeof rate === 'number' && !Number.isNaN(rate) ? Math.min(0.98, Math.max(0.02, rate)) : 0.45;
  const selectivityStress = 1 - r;
  return {
    safetyFloor: 5.8 + 2.6 * selectivityStress,
    targetFloor: 4.2 + 2.2 * selectivityStress,
  };
}

/**
 * @param {number} alignmentScore - Competitiveness-adjusted headline (0–10)
 * @param {object} universityProfile
 * @returns {{ band: 'reach'|'target'|'safety', reasoning: string }}
 */
function computeAdmissionsSummary(alignmentScore, universityProfile) {
  const score = typeof alignmentScore === 'number' && !Number.isNaN(alignmentScore) ? alignmentScore : 0;
  const name = universityProfile?.name || 'this institution';
  const rate = effectiveAdmitRate(universityProfile);
  const parsedRate = parseAcceptanceRateFraction(universityProfile?.acceptance_rate_estimate);
  const { safetyFloor, targetFloor } = bandThresholds(rate);

  let band;
  if (score >= safetyFloor) band = 'safety';
  else if (score >= targetFloor) band = 'target';
  else band = 'reach';

  const rateSource =
    parsedRate != null
      ? `published admit-band (~${Math.round(rate * 100)}%)`
      : `selectivity tier (estimated ~${Math.round(rate * 100)}% admit context)`;

  const reasoning = `Headline score ${score.toFixed(1)}/10 is calibrated for how competitive admission is at ${name}, using ${rateSource}. At that bar, we map you to ${band.toUpperCase()} — a planning label, not an odds estimate.`;

  return { band, reasoning };
}

module.exports = {
  computeAdmissionsSummary,
  parseAcceptanceRateFraction,
  selectivityRank,
};
