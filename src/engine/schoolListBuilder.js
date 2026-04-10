/**
 * School List Builder
 *
 * Evaluates a student's profile against ALL supported schools,
 * classifies each as reach/target/safety, and recommends
 * a strategic application list.
 *
 * Uses cached evaluations where available, runs fresh evaluations
 * for uncached schools.
 */

const evaluationEngine = require('./evaluationEngine');
const universityDataLoader = require('../loaders/universityDataLoader');
const { hashPayload, getCached, setCache } = require('../services/evaluationCache');
const { normalizeApplicationInput } = require('../schemas/canonicalApplication');

/**
 * Run evaluations against all supported schools.
 * Uses cache where available.
 *
 * @param {object} application - Normalized application profile
 * @returns {Promise<Array>} Array of evaluation results with school name and band
 */
async function evaluateAllSchools(application) {
  const schools = universityDataLoader.getUniversities();
  const payloadHash = hashPayload(application);
  const results = [];

  for (const school of schools) {
    // Check cache first
    const cached = await getCached(payloadHash, school.name);
    if (cached) {
      console.log(`[SchoolList] Cache HIT: ${school.name}`);
      results.push(cached);
      continue;
    }

    // Cache miss — run evaluation
    console.log(`[SchoolList] Cache MISS: ${school.name}`);
    const result = await evaluationEngine.evaluate(application, school);
    results.push(result);

    // Cache for future use (fire-and-forget)
    setCache(payloadHash, school.name, result)
      .catch(err => console.error(`[SchoolList] Cache write failed: ${err.message}`));
  }

  return results;
}

/**
 * Classify results into reach/target/safety buckets
 * and sort within each bucket by alignment score.
 */
function classifySchools(evaluationResults) {
  const reaches = [];
  const targets = [];
  const safeties = [];

  for (const result of evaluationResults) {
    const band = result.admissionsSummary?.band || result.band || 'reach';
    const entry = {
      university: result.university || result.school || 'Unknown',
      alignmentScore: result.alignmentScore ?? 0,
      band,
      coreInsight: result.coreInsight || '',
      mostImportantNextStep: result.mostImportantNextStep || '',
      strongestDimension: findStrongestDimension(result),
      weakestDimension: findWeakestDimension(result),
      academicStrength: result.academicStrength ?? 0,
      activityImpact: result.activityImpact ?? 0,
      honorsAwards: result.honorsAwards ?? 0,
      narrativeStrength: result.narrativeStrength ?? 0,
      institutionalFit: result.institutionalFit ?? 0,
    };

    if (band === 'safety') safeties.push(entry);
    else if (band === 'target') targets.push(entry);
    else reaches.push(entry);
  }

  // Sort each bucket by alignment score descending
  reaches.sort((a, b) => b.alignmentScore - a.alignmentScore);
  targets.sort((a, b) => b.alignmentScore - a.alignmentScore);
  safeties.sort((a, b) => b.alignmentScore - a.alignmentScore);

  return { reaches, targets, safeties };
}

/**
 * Find the strongest dimension for a result.
 */
function findStrongestDimension(result) {
  const dims = {
    'Academic Preparation': result.academicStrength ?? 0,
    'Extracurricular Impact': result.activityImpact ?? 0,
    'Honors & Recognition': result.honorsAwards ?? 0,
    'Essay & Narrative': result.narrativeStrength ?? 0,
    'Institutional Fit': result.institutionalFit ?? 0,
  };
  const best = Object.entries(dims).sort((a, b) => b[1] - a[1])[0];
  return { label: best[0], score: best[1] };
}

/**
 * Find the weakest dimension for a result.
 */
function findWeakestDimension(result) {
  const dims = {
    'Academic Preparation': result.academicStrength ?? 0,
    'Extracurricular Impact': result.activityImpact ?? 0,
    'Honors & Recognition': result.honorsAwards ?? 0,
    'Essay & Narrative': result.narrativeStrength ?? 0,
    'Institutional Fit': result.institutionalFit ?? 0,
  };
  const worst = Object.entries(dims).sort((a, b) => a[1] - b[1])[0];
  return { label: worst[0], score: worst[1] };
}

/**
 * Generate the strategic recommendation.
 */
function generateRecommendation(classified, application) {
  const { reaches, targets, safeties } = classified;
  const total = reaches.length + targets.length + safeties.length;
  const major = application?.intendedMajor || application?.academics?.intendedMajor || 'your intended field';

  // Find the student's strongest dimension across all schools
  const allResults = [...reaches, ...targets, ...safeties];
  const avgDimensions = {
    academic: avg(allResults.map(r => r.academicStrength)),
    activities: avg(allResults.map(r => r.activityImpact)),
    honors: avg(allResults.map(r => r.honorsAwards)),
    narrative: avg(allResults.map(r => r.narrativeStrength)),
    fit: avg(allResults.map(r => r.institutionalFit)),
  };

  const strongestOverall = Object.entries(avgDimensions).sort((a, b) => b[1] - a[1])[0];
  const weakestOverall = Object.entries(avgDimensions).sort((a, b) => a[1] - b[1])[0];

  const dimensionLabels = {
    academic: 'academic preparation',
    activities: 'extracurricular impact',
    honors: 'honors and recognition',
    narrative: 'essay and narrative',
    fit: 'institutional fit',
  };

  let summary = '';

  if (safeties.length === 0 && targets.length === 0) {
    summary = `All ${total} schools in our database are reaches for your current profile. This doesn't mean you can't get in — but it means your application strategy needs to be exceptional, especially in ${dimensionLabels[weakestOverall[0]]}. Focus on schools where your ${dimensionLabels[strongestOverall[0]]} gives you the strongest advantage.`;
  } else if (safeties.length === 0) {
    summary = `You have ${targets.length} target school${targets.length > 1 ? 's' : ''} and ${reaches.length} reach${reaches.length !== 1 ? 'es' : ''} in our database. Your strongest signal across schools is ${dimensionLabels[strongestOverall[0]]}. Consider adding safety schools to your list for peace of mind — we're expanding our school database soon.`;
  } else {
    summary = `Based on your profile, you have ${safeties.length} safety school${safeties.length > 1 ? 's' : ''}, ${targets.length} target${targets.length > 1 ? 's' : ''}, and ${reaches.length} reach${reaches.length !== 1 ? 'es' : ''}. Your strongest dimension is ${dimensionLabels[strongestOverall[0]]}, and your biggest opportunity for improvement is ${dimensionLabels[weakestOverall[0]]}. A balanced application list typically includes 2 safeties, 3-4 targets, and 2-3 reaches.`;
  }

  // Build a recommended list (max 4 schools to display prominently)
  const recommended = [];

  // Pick best reach (if any)
  if (reaches.length > 0) {
    recommended.push({ ...reaches[0], reason: `Your strongest reach — highest alignment score among reach schools. Your ${reaches[0].strongestDimension.label} (${reaches[0].strongestDimension.score}/10) is your best asset here.` });
  }

  // Pick best target(s)
  for (const t of targets.slice(0, 2)) {
    recommended.push({ ...t, reason: `Strong target — your profile aligns well with this school's expectations. ${t.strongestDimension.label} at ${t.strongestDimension.score}/10 stands out.` });
  }

  // Pick best safety
  if (safeties.length > 0) {
    recommended.push({ ...safeties[0], reason: `Solid safety — your profile exceeds this school's benchmarks. Focus your energy on reach and target essays instead.` });
  }

  // If we don't have 4 yet, fill from reaches
  while (recommended.length < 4 && reaches.length > recommended.filter(r => r.band === 'reach').length) {
    const nextReach = reaches.find(r => !recommended.some(rec => rec.university === r.university));
    if (nextReach) {
      recommended.push({ ...nextReach, reason: `Additional reach to diversify your list.` });
    } else break;
  }

  // Cap at 4
  const displayList = recommended.slice(0, 4);

  return {
    summary,
    strongestDimension: {
      label: dimensionLabels[strongestOverall[0]],
      avgScore: Math.round(strongestOverall[1] * 10) / 10,
    },
    weakestDimension: {
      label: dimensionLabels[weakestOverall[0]],
      avgScore: Math.round(weakestOverall[1] * 10) / 10,
    },
    recommendedList: displayList,
    totalSchoolsEvaluated: total,
  };
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * Build a complete school list recommendation.
 *
 * @param {object} application - Raw application profile
 * @returns {Promise<object>} Complete recommendation with classified schools
 */
async function buildSchoolList(application) {
  const normalized = normalizeApplicationInput(application);
  const evaluationResults = await evaluateAllSchools(normalized);
  const classified = classifySchools(evaluationResults);
  const recommendation = generateRecommendation(classified, normalized);

  return {
    ...recommendation,
    reaches: classified.reaches,
    targets: classified.targets,
    safeties: classified.safeties,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { buildSchoolList, evaluateAllSchools, classifySchools };
