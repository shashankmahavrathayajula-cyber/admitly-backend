const universityDataLoader = require('../loaders/universityDataLoader');
const evaluationEngine = require('../engine/evaluationEngine');

/**
 * Evaluate an application against multiple universities.
 * @param {object} application - Student application payload
 * @param {string[]} universityNames - List of university names to evaluate against
 * @returns {Promise<object[]>} Array of evaluation results per university (only for found universities)
 */
async function evaluateApplication(application, universityNames) {
  const profiles = universityDataLoader.getByNames(universityNames);
  const results = [];

  for (const universityProfile of profiles) {
    const result = await evaluationEngine.evaluate(application, universityProfile);
    results.push(result);
  }

  return results;
}

module.exports = {
  evaluateApplication,
};
