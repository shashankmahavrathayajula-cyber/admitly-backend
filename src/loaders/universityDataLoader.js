const fs = require('fs');
const path = require('path');
const { validateUniversityEntry, describeStructure } = require('../schemas/universitySchema');

let cachedUniversities = null;
let cachedByName = null;

/**
 * Normalize university name for matching: lowercase, trim, collapse spaces.
 * Enables "University of Washington" to match "university of washington".
 */
function normalizeName(name) {
  if (typeof name !== 'string') return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Load and validate the university dataset. Exits process on failure.
 * @param {string} dataPath - Absolute path to the JSON file
 * @returns {object[]} Array of validated university objects
 */
function loadAndValidate(dataPath) {
  if (!path.isAbsolute(dataPath)) {
    console.error('[UniversityDataLoader] DATA_PATH must be resolved to an absolute path.');
    process.exit(1);
  }

  if (!fs.existsSync(dataPath)) {
    console.error('[UniversityDataLoader] Dataset file does not exist:', dataPath);
    console.error('Please ensure the university JSON file is placed at backend/data/ and that DATA_PATH is correct.');
    process.exit(1);
  }

  let raw;
  try {
    raw = fs.readFileSync(dataPath, 'utf8');
  } catch (err) {
    console.error('[UniversityDataLoader] Failed to read file:', err.message);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('[UniversityDataLoader] Invalid JSON:', err.message);
    process.exit(1);
  }

  if (!Array.isArray(parsed)) {
    console.error('[UniversityDataLoader] Dataset must be a JSON array. Detected structure:');
    console.error(describeStructure(parsed));
    console.error('Please normalize or transform the dataset to an array of university objects.');
    process.exit(1);
  }

  const validated = [];
  for (let i = 0; i < parsed.length; i++) {
    const result = validateUniversityEntry(parsed[i], i);
    if (!result.valid) {
      console.error('[UniversityDataLoader] Validation failed:', result.error);
      console.error('[UniversityDataLoader] First invalid entry structure:');
      console.error(describeStructure(parsed[i]));
      console.error('Please fix the dataset or normalize it to match the expected university schema.');
      process.exit(1);
    }
    validated.push(parsed[i]);
  }

  return validated;
}

/**
 * Initialize the loader with the given data path. Call once at startup.
 * @param {string} dataPath - Absolute path to the JSON file
 */
function init(dataPath) {
  cachedUniversities = loadAndValidate(dataPath);
  cachedByName = new Map();
  for (const u of cachedUniversities) {
    cachedByName.set(normalizeName(u.name), u);
  }
  console.log(
    '[UniversityDataLoader] Dataset ready:',
    cachedUniversities.length,
    'universities indexed by name'
  );
}

/**
 * Get all universities. init() must have been called first.
 */
function getUniversities() {
  if (cachedUniversities === null) {
    throw new Error('University data loader not initialized. Call init(dataPath) at startup.');
  }
  return cachedUniversities;
}

/**
 * Get universities by name (flexible match: exact normalized name).
 * Partial match: check if normalized requested name is contained in normalized university name or vice versa.
 * @param {string[]} names - Requested university names
 * @returns {object[]} Matched university profiles (may be fewer than requested if some names not found)
 */
function getByNames(names) {
  if (cachedByName === null) {
    throw new Error('University data loader not initialized. Call init(dataPath) at startup.');
  }
  const result = [];
  const seen = new Set();
  for (const name of names) {
    const norm = normalizeName(name);
    let found = cachedByName.get(norm);
    if (!found) {
      for (const [key, uni] of cachedByName) {
        if (key.includes(norm) || norm.includes(key)) {
          found = uni;
          break;
        }
      }
    }
    if (found && !seen.has(found.name)) {
      seen.add(found.name);
      result.push(found);
    }
  }
  return result;
}

module.exports = {
  init,
  getUniversities,
  getByNames,
  loadAndValidate,
};
