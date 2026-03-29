/**
 * Registry of analyzers. Add new analyzers here to include them in the pipeline.
 * Each analyzer must export: analyze(applicationProfile, universityProfile) -> { score, strengths, weaknesses, suggestions }
 */

const academicStrengthAnalyzer = require('./academicStrengthAnalyzer');
const activitiesImpactAnalyzer = require('./activitiesImpactAnalyzer');
const honorsAwardsAnalyzer = require('./honorsAwardsAnalyzer');
const narrativeEssayAnalyzer = require('./narrativeEssayAnalyzer');
const institutionalFitAnalyzer = require('./institutionalFitAnalyzer');

const ANALYZERS = [
  { key: 'academic', name: 'Academic', fn: academicStrengthAnalyzer.analyze },
  { key: 'activities', name: 'Activities', fn: activitiesImpactAnalyzer.analyze },
  { key: 'honors', name: 'Honors', fn: honorsAwardsAnalyzer.analyze },
  { key: 'narrative', name: 'Narrative', fn: narrativeEssayAnalyzer.analyze },
  { key: 'institutionalFit', name: 'Institutional Fit', fn: institutionalFitAnalyzer.analyze },
];

module.exports = {
  ANALYZERS,
};
