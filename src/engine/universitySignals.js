/**
 * Shared parsing of institutional selectivity signals from university profiles.
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
 * Single 0–1 "accessibility" proxy: higher = easier to get in (larger share admitted).
 * Uses parsed admit rate when present; otherwise a tier default.
 */
function effectiveAdmitRate(universityProfile) {
  const parsed = parseAcceptanceRateFraction(universityProfile?.acceptance_rate_estimate);
  if (parsed != null) {
    return Math.min(0.98, Math.max(0.02, parsed));
  }
  const tier = selectivityRank(universityProfile?.selectivity_level);
  if (tier >= 3) return 0.08;
  if (tier === 2) return 0.45;
  return 0.82;
}

module.exports = {
  parseAcceptanceRateFraction,
  selectivityRank,
  effectiveAdmitRate,
};
