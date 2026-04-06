const universityDataLoader = require('../loaders/universityDataLoader');
const evaluationEngine = require('../engine/evaluationEngine');
const config = require('../config');

/**
 * Evaluate an application against multiple universities.
 * @param {object} application - Student application payload
 * @param {string[]} universityNames - List of university names to evaluate against
 * @returns {Promise<object[]>} Array of evaluation results per university (only for found universities)
 */

async function evaluateApplication(application, universityNames) {
  if (config.isDevelopment) {
    console.log('EVAL SERVICE INPUT universityNames:', universityNames);
    console.log('EVAL SERVICE INPUT application:', JSON.stringify(application, null, 2));
  }
  const profiles = universityDataLoader.getByNames(universityNames);
  if (config.isDevelopment) {
    console.log('MATCHED PROFILES COUNT:', profiles.length);
    console.log('MATCHED PROFILES:', profiles);
  }
  const results = [];

  for (const universityProfile of profiles) {
    const result = await evaluationEngine.evaluate(application, universityProfile);
    results.push(result);
  }
  if (config.isDevelopment) {
    console.log('EVAL SERVICE OUTPUT:', JSON.stringify(results, null, 2));
  }
  return results;
}

module.exports = {
  evaluateApplication,
};
