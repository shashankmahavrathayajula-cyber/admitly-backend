/**
 * Validates the scoring engine against reference profiles.
 * Checks: rank ordering, score spread, band correctness.
 *
 * Usage: node scripts/validateReferenceProfiles.js
 */

const { PROFILES, SCHOOL_TIERS } = require('./referenceProfiles');
const universityDataLoader = require('../src/loaders/universityDataLoader');
const config = require('../src/config');
const evaluationEngine = require('../src/engine/evaluationEngine');
const { normalizeApplicationInput } = require('../src/schemas/canonicalApplication');

universityDataLoader.init(config.dataPath);

async function main() {
  const schools = universityDataLoader.getUniversities();
  const failures = [];
  const results = {};

  // Run all profiles against all schools
  for (const [profileKey, profile] of Object.entries(PROFILES)) {
    results[profileKey] = {};
    const app = normalizeApplicationInput(profile.application);

    for (const school of schools) {
      const result = await evaluationEngine.evaluate(app, school);
      results[profileKey][school.name] = {
        alignmentScore: result.alignmentScore,
        band: result.admissionsSummary?.band,
        academic: result.academicStrength,
        activities: result.activityImpact,
        honors: result.honorsAwards,
        narrative: result.narrativeStrength,
        fit: result.institutionalFit,
      };
    }
  }

  // Print results table
  console.log('\n=== REFERENCE PROFILE SCORES ===\n');
  const profileKeys = Object.keys(PROFILES);

  for (const school of schools) {
    const tier = SCHOOL_TIERS[school.name] || 'unknown';
    console.log(`\n--- ${school.name} (${tier}) ---`);
    console.log('Profile    | Align | Band   | Acad | Act  | Hon  | Narr | Fit');
    console.log('-'.repeat(75));

    for (const pk of profileKeys) {
      const r = results[pk][school.name];
      if (!r) continue;
      const row = [
        `Profile ${pk}`.padEnd(10),
        String(r.alignmentScore).padStart(5),
        String(r.band || '?').padEnd(6),
        String(r.academic).padStart(4),
        String(r.activities).padStart(4),
        String(r.honors).padStart(4),
        String(r.narrative).padStart(4),
        String(r.fit).padStart(4),
      ].join(' | ');
      console.log(row);
    }
  }

  // Validate rank ordering
  console.log('\n=== RANK ORDER CHECKS ===\n');
  for (const school of schools) {
    const tier = SCHOOL_TIERS[school.name];
    const scores = profileKeys.map(pk => ({
      profile: pk,
      score: results[pk][school.name]?.alignmentScore ?? 0,
    }));

    for (let i = 0; i < scores.length - 1; i++) {
      const higher = scores[i];
      const lower = scores[i + 1];
      if (higher.score <= lower.score) {
        const msg = `RANK VIOLATION at ${school.name}: Profile ${higher.profile} (${higher.score}) <= Profile ${lower.profile} (${lower.score})`;
        console.log(`  ❌ ${msg}`);
        failures.push(msg);
      }
    }
  }

  // Validate score spread
  console.log('\n=== SPREAD CHECKS ===\n');
  for (const school of schools) {
    const scoreA = results['A'][school.name]?.alignmentScore ?? 0;
    const scoreE = results['E'][school.name]?.alignmentScore ?? 0;
    const spread = scoreA - scoreE;
    const ok = spread >= 3.0;
    console.log(`  ${ok ? '✅' : '❌'} ${school.name}: A=${scoreA}, E=${scoreE}, spread=${spread.toFixed(1)} (min 3.0)`);
    if (!ok) failures.push(`SPREAD too narrow at ${school.name}: ${spread.toFixed(1)} < 3.0`);
  }

  // Validate expected score ranges
  console.log('\n=== RANGE CHECKS ===\n');
  for (const [pk, profile] of Object.entries(PROFILES)) {
    for (const school of schools) {
      const tier = SCHOOL_TIERS[school.name];
      if (!tier) continue;
      const expected = profile.expectedScores[tier];
      if (!expected) continue;
      const actual = results[pk][school.name]?.alignmentScore ?? 0;
      const ok = actual >= expected.min && actual <= expected.max;
      if (!ok) {
        const msg = `Profile ${pk} at ${school.name} (${tier}): ${actual} not in [${expected.min}, ${expected.max}]`;
        console.log(`  ❌ ${msg}`);
        failures.push(msg);
      }
    }
  }

  // Validate band expectations
  console.log('\n=== BAND CHECKS ===\n');
  const bandSchoolMap = {
    stanford: 'Stanford University',
    harvard: 'Harvard University',
    mit: 'Massachusetts Institute of Technology',
    uw: 'University of Washington',
    wsu: 'Washington State University',
  };
  for (const [pk, profile] of Object.entries(PROFILES)) {
    for (const [bandKey, expectedBand] of Object.entries(profile.expectedBands || {})) {
      const schoolName = bandSchoolMap[bandKey];
      if (!schoolName) continue;
      const actual = results[pk][schoolName]?.band;
      const ok = actual === expectedBand;
      if (!ok) {
        const msg = `Profile ${pk} at ${schoolName}: band=${actual}, expected=${expectedBand}`;
        console.log(`  ❌ ${msg}`);
        failures.push(msg);
      }
    }
  }

  // Summary
  console.log('\n=== SUMMARY ===\n');
  if (failures.length === 0) {
    console.log('✅ All checks passed.');
  } else {
    console.log(`❌ ${failures.length} failure(s):`);
    failures.forEach(f => console.log(`  - ${f}`));
  }

  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
