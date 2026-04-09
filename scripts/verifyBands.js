#!/usr/bin/env node
/**
 * Temporary verification: one test profile × all schools → alignment score, band, floors.
 * Thresholds use the same bandThresholds + effectiveAdmitRate as computeAdmissionsSummary.
 *
 * Run: node scripts/verifyBands.js
 */

process.env.USE_AI_ANALYZERS = 'false';

const path = require('path');
const universityDataLoader = require('../src/loaders/universityDataLoader');
const config = require('../src/config');
const evaluationEngine = require('../src/engine/evaluationEngine');
const { bandThresholds, effectiveAdmitRate } = require('../src/engine/admissionsSummary');

const testProfile = {
  academics: { gpa: 3.85, courseRigor: 'ap_ib', intendedMajor: 'Computer Science' },
  activities: [
    {
      name: 'Robotics Club',
      role: 'Team Captain',
      description: 'Led 15-member team building autonomous robots',
      yearsActive: 3,
      isLeadership: true,
    },
    {
      name: 'Code for Community',
      role: 'Founder',
      description: 'Builds websites for local nonprofits',
      yearsActive: 2,
      isLeadership: true,
    },
    {
      name: 'Math Tutoring',
      role: 'Volunteer Tutor',
      description: 'Tutored underclassmen in algebra weekly',
      yearsActive: 2,
      isLeadership: false,
    },
  ],
  honors: [
    { title: 'AP Scholar with Distinction', level: 'national', year: '2024' },
    { title: 'First Place Regional Robotics', level: 'regional', year: '2023' },
  ],
  essays: {
    personalStatement:
      'When our robotics prototype failed at regionals, I spent three weeks reverse-engineering the sensor array. That process shaped how I approach every problem now. I want to study computer science because building things that work requires understanding why things break.',
  },
  intendedMajor: 'Computer Science',
};

async function main() {
  const dataPath = path.isAbsolute(config.dataPath) ? config.dataPath : path.join(process.cwd(), config.dataPath);
  universityDataLoader.init(dataPath);
  const schools = universityDataLoader.getUniversities();

  const rows = [];
  for (const uni of schools) {
    const result = await evaluationEngine.evaluate(testProfile, uni);
    const rate = effectiveAdmitRate(uni);
    const { targetFloor, safetyFloor } = bandThresholds(rate);
    rows.push({
      name: uni.name,
      rate,
      alignmentScore: result.alignmentScore,
      band: result.admissionsSummary?.band ?? '—',
      targetFloor: Number(targetFloor.toFixed(2)),
      safetyFloor: Number(safetyFloor.toFixed(2)),
    });
  }

  rows.sort((a, b) => a.rate - b.rate);

  console.log('verifyBands: test profile vs all schools (sorted by admit rate ↑ = most selective first)\n');
  console.log(
    [
      'School'.padEnd(42),
      'Admit%'.padStart(7),
      'Align'.padStart(6),
      'Band'.padStart(8),
      'T_floor'.padStart(8),
      'S_floor'.padStart(8),
    ].join('  ')
  );
  console.log('-'.repeat(92));
  for (const r of rows) {
    console.log(
      [
        r.name.slice(0, 41).padEnd(42),
        String(Math.round(r.rate * 100)).padStart(6) + '%',
        String(r.alignmentScore).padStart(6),
        String(r.band).padStart(8),
        String(r.targetFloor).padStart(8),
        String(r.safetyFloor).padStart(8),
      ].join('  ')
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
