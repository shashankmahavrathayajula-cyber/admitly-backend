/**
 * Converts raw weighted rubric alignment into a headline score that reflects
 * how competitive the same profile looks at institutions with different bars.
 *
 * Subscores (per-dimension) stay raw; only the overall alignmentScore is calibrated.
 */

const { effectiveAdmitRate } = require('./universitySignals');

/**
 * @param {number} rawAlignment - Weighted mean of analyzer scores (0–10)
 * @param {object} universityProfile
 * @returns {number} Competitiveness-adjusted score (0–10, 1 decimal)
 */
function applySelectivityCalibration(rawAlignment, universityProfile) {
  const raw =
    typeof rawAlignment === 'number' && !Number.isNaN(rawAlignment)
      ? Math.max(0, Math.min(10, rawAlignment))
      : 0;

  const rate = effectiveAdmitRate(universityProfile);

  // Expand distance from neutral (5) at accessible schools; compress at selective ones.
  const factor = 0.48 + rate * 1.04;
  const adjusted = 5 + (raw - 5) * factor;

  return Math.round(Math.max(0, Math.min(10, adjusted)) * 10) / 10;
}

module.exports = {
  applySelectivityCalibration,
};
