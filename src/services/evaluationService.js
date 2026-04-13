const universityDataLoader = require('../loaders/universityDataLoader');
const evaluationEngine = require('../engine/evaluationEngine');
const config = require('../config');
const { hashPayload, getCached, setCache } = require('./evaluationCache');

/**
 * Evaluate an application against multiple universities.
 * @param {object} application - Student application payload
 * @param {string[]} universityNames - List of university names to evaluate against
 * @param {string} userId - Authenticated user id (scopes evaluation_cache reads/writes)
 * @returns {Promise<object[]>} Array of evaluation results per university (only for found universities)
 */

async function evaluateApplication(application, universityNames, userId) {
  if (config.isDevelopment) {
    console.log('EVAL SERVICE INPUT universityNames:', universityNames);
    console.log('EVAL SERVICE INPUT application:', JSON.stringify(application, null, 2));
  }
  const profiles = universityDataLoader.getByNames(universityNames);
  if (config.isDevelopment) {
    console.log('MATCHED PROFILES COUNT:', profiles.length);
    console.log('MATCHED PROFILES:', profiles);
  }
  const payloadHash = hashPayload(application, userId);
  const results = [];

  for (const universityProfile of profiles) {
    const cached = await getCached(payloadHash, universityProfile.name, userId);
    if (cached) {
      if (config.isDevelopment) {
        console.log(`[Cache] HIT for ${universityProfile.name}`);
      }
      results.push(cached);
      continue;
    }

    if (config.isDevelopment) {
      console.log(`[Cache] MISS for ${universityProfile.name}`);
    }
    const result = await evaluationEngine.evaluate(application, universityProfile);
    results.push(result);

    setCache(payloadHash, universityProfile.name, result, userId)
      .catch(err => console.error('[Cache] Background write failed:', err.message));
  }
  if (config.isDevelopment) {
    console.log('EVAL SERVICE OUTPUT:', JSON.stringify(results, null, 2));
  }
  return results;
}

module.exports = {
  evaluateApplication,
};
