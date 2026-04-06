#!/usr/bin/env node
/**
 * Deterministic evaluation matrix: USE_AI_ANALYZERS=false (rule-based analyzers only).
 * Run: node scripts/validateEvaluationMatrix.js
 *
 * Objective checks: score ranges, rigor sensitivity, essay sensitivity, UW vs WSU deltas,
 * contradiction patterns, nested-schema behavior.
 *
 * | ID | Scenario                         | What we assert (objective)                          |
 * |----|----------------------------------|-----------------------------------------------------|
 * | A  | Baseline CS + activities + essay | Scores in [0,10]; coreInsight names each school     |
 * | B  | Same profile UW vs WSU           | alignmentScore(UW) ≤ alignmentScore(WSU) (calibration)|
 * | C  | courseRigor standard vs ap_ib    | academic(UW) higher for ap_ib                       |
 * | D  | essays {} vs full PS             | narrative lower when no real essay body           |
 * | E  | academics.apCourses only       | courseRigorIndicated; academic ≥ no-AP control     |
 * | F  | Major present                    | No "no intended major" weakness pattern            |
 * | G  | Team leader, no isLeadership     | summarizeStemAndLeadershipSignals founderCue       |
 * | H  | Aggregator                       | narrative weight differs UW vs WSU                  |
 * | I  | Frontend-shaped payload          | gpa only under academics — still evaluates          |
 */

process.env.USE_AI_ANALYZERS = 'false';

const universityDataLoader = require('../src/loaders/universityDataLoader');
const config = require('../src/config');
const evaluationEngine = require('../src/engine/evaluationEngine');
const { normalizeApplicationInput, courseRigorIndicated } = require('../src/schemas/canonicalApplication');
const { summarizeStemAndLeadershipSignals } = require('../src/engine/majorFitHelpers');

universityDataLoader.init(config.dataPath);

const UW = universityDataLoader.getByNames(['University of Washington'])[0];
const WSU = universityDataLoader.getByNames(['Washington State University'])[0];

function assert(cond, msg) {
  if (!cond) {
    const err = new Error(msg);
    err.code = 'ASSERT';
    throw err;
  }
}

function baseProfile(overrides = {}) {
  const b = {
    academics: {
      gpa: 3.85,
      courseRigor: 'ap_ib',
      intendedMajor: 'Computer Science',
    },
    gpa: 3.85,
    courseRigor: 'ap_ib',
    intendedMajor: 'Computer Science',
    activities: [
      {
        name: 'CS Club',
        role: 'Founder',
        description: 'Robotics and Python teaching',
        yearsActive: 3,
        isLeadership: true,
      },
    ],
    honors: [{ title: 'AP Scholar', level: 'National', year: 2024 }],
    essays: {
      personalStatement:
        'I want to study computer science because I built a club from scratch. "We grew from zero to forty members."',
    },
  };
  return { ...b, ...overrides };
}

function scoresOk(r) {
  const nums = [
    r.alignmentScore,
    r.academicStrength,
    r.activityImpact,
    r.honorsAwards,
    r.narrativeStrength,
    r.institutionalFit,
  ];
  for (const n of nums) {
    if (typeof n !== 'number' || Number.isNaN(n) || n < 0 || n > 10) return false;
  }
  return true;
}

const BAD_MAJOR_WEAKNESS =
  /\bno\s+mention\s+of\s+(the\s+)?intended\s+major\b|\b(no|lacks)\s+(any\s+)?mention\s+of\s+(the\s+)?intended\s+major\b/i;

async function main() {
  const failures = [];
  const notes = [];

  const schools = [UW, WSU];

  try {
    // --- Score bounds
    for (const uni of schools) {
      const r = await evaluationEngine.evaluate(baseProfile(), uni);
      assert(scoresOk(r), `scores 0-10 ${uni.name}`);
      assert(typeof r.coreInsight === 'string' && r.coreInsight.includes(uni.name), `coreInsight names school ${uni.name}`);
    }

    // --- UW vs WSU: headline calibration (selective vs accessible)
    const rUw = await evaluationEngine.evaluate(baseProfile(), UW);
    const rWsu = await evaluationEngine.evaluate(baseProfile(), WSU);
    assert(rUw.alignmentScore <= rWsu.alignmentScore, 'Same profile: UW calibrated headline should not exceed WSU');

    // --- Course rigor sensitivity (academic subscore)
    const pStd = normalizeApplicationInput(
      baseProfile({
        academics: { gpa: 3.85, courseRigor: 'standard', intendedMajor: 'Computer Science' },
        courseRigor: 'standard',
      })
    );
    const pAp = normalizeApplicationInput(baseProfile());
    const rs = await evaluationEngine.evaluate(pStd, UW);
    const ra = await evaluationEngine.evaluate(pAp, UW);
    assert(ra.academicStrength > rs.academicStrength, `rigor: ap_ib (${ra.academicStrength}) > standard (${rs.academicStrength})`);

    // --- Essay sensitivity
    const noEssay = normalizeApplicationInput(
      baseProfile({
        essays: {},
        personalStatement: undefined,
      })
    );
    const ne = await evaluationEngine.evaluate(noEssay, UW);
    const withEssay = await evaluationEngine.evaluate(baseProfile(), UW);
    assert(ne.narrativeStrength < withEssay.narrativeStrength, 'no essay lowers narrative');

    // --- Nested academics.apCourses indicates rigor (no flat apCourses)
    const nestedOnly = normalizeApplicationInput({
      academics: {
        gpa: 3.9,
        courseRigor: 'standard',
        intendedMajor: 'Computer Science',
        apCourses: ['AP Calculus BC', 'AP Physics C'],
      },
    });
    assert(courseRigorIndicated(nestedOnly), 'courseRigorIndicated true when only academics.apCourses set');

    const rNested = await evaluationEngine.evaluate(nestedOnly, UW);
    const rFlatNoAp = await evaluationEngine.evaluate(
      normalizeApplicationInput({
        academics: { gpa: 3.9, courseRigor: 'standard', intendedMajor: 'Computer Science' },
        courseRigor: 'standard',
      }),
      UW
    );
    assert(rNested.academicStrength >= rFlatNoAp.academicStrength, 'AP courses in academics should not reduce academic score vs none');

    // --- Contradiction: no "no intended major" when major present
    for (const uni of schools) {
      const r = await evaluationEngine.evaluate(baseProfile(), uni);
      const bad = (r.weaknesses || []).some((w) => BAD_MAJOR_WEAKNESS.test(w));
      assert(!bad, `no false "no intended major" at ${uni.name}`);
    }

    // --- Leadership blob: "Team leader" should register (not only isLeadership flag)
    const leaderProf = normalizeApplicationInput(
      baseProfile({
        activities: [
          {
            name: 'Debate',
            role: 'Team leader',
            description: 'Organized regional tournaments',
            yearsActive: 2,
            isLeadership: false,
          },
        ],
      })
    );
    const sigLeader = summarizeStemAndLeadershipSignals(leaderProf);
    assert(sigLeader.founderCue === true, 'Team leader role should set leadership/founder cue');

    // --- Differentiation: dimension weights differ UW vs WSU → narrative weight differs
    const wUw = require('../src/engine/aggregator').aggregatorWeightsFromUniversity(UW);
    const wWsu = require('../src/engine/aggregator').aggregatorWeightsFromUniversity(WSU);
    assert(wUw.narrative !== wWsu.narrative, 'Aggregator narrative weights differ UW vs WSU');
    notes.push(`narrative weight UW=${wUw.narrative.toFixed(3)} WSU=${wWsu.narrative.toFixed(3)}`);

    // --- Frontend payload shape (api.ts): gpa only under academics, no top-level gpa
    const frontendLike = normalizeApplicationInput({
      academics: {
        gpa: 3.8,
        courseRigor: 'ap_ib',
        intendedMajor: 'Computer Science',
      },
      activities: baseProfile().activities,
      honors: baseProfile().honors,
      essays: baseProfile().essays,
      intendedMajor: 'Computer Science',
    });
    assert(frontendLike.gpa === 3.8, 'normalize lifts gpa from academics');
    const rFront = await evaluationEngine.evaluate(frontendLike, UW);
    assert(scoresOk(rFront), 'frontend-shaped payload scores valid');
  } catch (e) {
    failures.push(e.message);
  }

  if (failures.length) {
    console.error('VALIDATION FAILED:\n', failures.join('\n'));
    process.exit(1);
  }
  console.log('validateEvaluationMatrix: all checks passed.');
  notes.forEach((n) => console.log(' ', n));
}

main();
