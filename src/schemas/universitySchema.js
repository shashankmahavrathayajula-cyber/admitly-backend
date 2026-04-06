/**
 * Expected shape for a university entry in the dataset.
 * Used by the data loader to validate entries before use.
 */

const REQUIRED_KEYS = [
  'name',
  'location',
  'selectivity_level',
  'acceptance_rate_estimate',
  'essay_importance',
  'extracurricular_importance',
  'academic_rigor_importance',
  'major_strengths',
  'traits',
  'evaluation_weights',
  'summary',
  'culture_notes',
];

const REQUIRED_TRAIT_KEYS = [
  'intellectual_vitality',
  'academic_rigor',
  'leadership',
  'initiative',
  'collaboration',
  'community_impact',
  'reflection_depth',
  'thematic_direction',
  'resilience',
];

const REQUIRED_WEIGHT_KEYS = ['gpa', 'course_rigor', 'extracurriculars', 'leadership', 'essay'];

const WEIGHT_SUM_TOLERANCE = 0.001;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isArrayOfStrings(value) {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isNumberInRange(value, min, max) {
  return typeof value === 'number' && !Number.isNaN(value) && value >= min && value <= max;
}

function isObjectWithNumericValues(obj, keys) {
  if (obj === null || typeof obj !== 'object') return false;
  return keys.every((key) => key in obj && isNumberInRange(obj[key], 0, 10));
}

function isWeightsObject(obj) {
  if (obj === null || typeof obj !== 'object') return false;
  const hasKeys = REQUIRED_WEIGHT_KEYS.every((key) => key in obj && typeof obj[key] === 'number');
  if (!hasKeys) return false;
  const sum = REQUIRED_WEIGHT_KEYS.reduce((s, key) => s + obj[key], 0);
  return Math.abs(sum - 1) <= WEIGHT_SUM_TOLERANCE;
}

/**
 * Validates a single university object.
 * @param {object} entry - Raw object from the JSON array
 * @param {number} index - Index in the array (for error messages)
 * @returns {{ valid: boolean, error?: string }}
 */
function validateUniversityEntry(entry, index = 0) {
  if (entry === null || typeof entry !== 'object') {
    return { valid: false, error: `Entry at index ${index}: expected an object, got ${typeof entry}` };
  }

  for (const key of REQUIRED_KEYS) {
    if (!(key in entry)) {
      return { valid: false, error: `Entry at index ${index} (name: "${entry.name || 'unknown'}") missing required key: "${key}"` };
    }
  }

  if (!isNonEmptyString(entry.name)) {
    return { valid: false, error: `Entry at index ${index}: "name" must be a non-empty string` };
  }
  if (!isNonEmptyString(entry.location)) {
    return { valid: false, error: `Entry at index ${index} (${entry.name}): "location" must be a non-empty string` };
  }
  if (!isArrayOfStrings(entry.major_strengths)) {
    return { valid: false, error: `Entry at index ${index} (${entry.name}): "major_strengths" must be an array of strings` };
  }
  if (!isObjectWithNumericValues(entry.traits, REQUIRED_TRAIT_KEYS)) {
    return { valid: false, error: `Entry at index ${index} (${entry.name}): "traits" must be an object with numeric values (0-10) for keys: ${REQUIRED_TRAIT_KEYS.join(', ')}` };
  }
  if (!isWeightsObject(entry.evaluation_weights)) {
    return { valid: false, error: `Entry at index ${index} (${entry.name}): "evaluation_weights" must be an object with keys ${REQUIRED_WEIGHT_KEYS.join(', ')} and values summing to 1.0` };
  }
  if (!isNonEmptyString(entry.summary)) {
    return { valid: false, error: `Entry at index ${index} (${entry.name}): "summary" must be a non-empty string` };
  }
  if (!Array.isArray(entry.culture_notes) || !entry.culture_notes.every((n) => typeof n === 'string')) {
    return { valid: false, error: `Entry at index ${index} (${entry.name}): "culture_notes" must be an array of strings` };
  }

  const enriched = validateOptionalEnrichment(entry, index);
  if (!enriched.valid) return enriched;

  return { valid: true };
}

/**
 * Optional high-leverage fields (school_priorities, institutional_tone, anti_patterns).
 * Omitted entries validate as before; when present, shape must be correct.
 */
function validateOptionalEnrichment(entry, index) {
  if (entry.school_priorities !== undefined) {
    if (!Array.isArray(entry.school_priorities) || entry.school_priorities.length === 0) {
      return {
        valid: false,
        error: `Entry at index ${index} (${entry.name}): "school_priorities" must be a non-empty array when provided`,
      };
    }
    for (let i = 0; i < entry.school_priorities.length; i++) {
      const p = entry.school_priorities[i];
      if (!p || typeof p !== 'object') {
        return { valid: false, error: `Entry at index ${index} (${entry.name}): school_priorities[${i}] must be an object with theme and reader_looks_for` };
      }
      if (!isNonEmptyString(p.theme) || !isNonEmptyString(p.reader_looks_for)) {
        return {
          valid: false,
          error: `Entry at index ${index} (${entry.name}): school_priorities[${i}] requires non-empty "theme" and "reader_looks_for" strings`,
        };
      }
    }
  }

  if (entry.institutional_tone !== undefined && !isNonEmptyString(entry.institutional_tone)) {
    return { valid: false, error: `Entry at index ${index} (${entry.name}): "institutional_tone" must be a non-empty string when provided` };
  }

  if (entry.anti_patterns !== undefined) {
    if (!Array.isArray(entry.anti_patterns) || !entry.anti_patterns.every((s) => typeof s === 'string' && s.trim())) {
      return { valid: false, error: `Entry at index ${index} (${entry.name}): "anti_patterns" must be an array of non-empty strings when provided` };
    }
  }

  if (entry.standardized_testing !== undefined) {
    const st = entry.standardized_testing;
    if (st === null || typeof st !== 'object') {
      return { valid: false, error: `Entry at index ${index} (${entry.name}): "standardized_testing" must be an object when provided` };
    }
    const allowed = ['test_blind', 'test_optional', 'test_required', 'not_used'];
    if (typeof st.policy !== 'string' || !allowed.includes(st.policy.trim())) {
      return {
        valid: false,
        error: `Entry at index ${index} (${entry.name}): standardized_testing.policy must be one of: ${allowed.join(', ')}`,
      };
    }
    if (st.reviewer_note !== undefined && typeof st.reviewer_note !== 'string') {
      return { valid: false, error: `Entry at index ${index} (${entry.name}): standardized_testing.reviewer_note must be a string when provided` };
    }
  }

  return { valid: true };
}

/**
 * Returns a minimal description of the first object's structure (for error reporting).
 * @param {object} obj
 * @returns {string}
 */
function describeStructure(obj) {
  if (obj === null || typeof obj !== 'object') return String(obj);
  const keys = Object.keys(obj);
  const types = keys.map((k) => `${k}: ${typeof obj[k]}`);
  const traitsKeys = obj.traits && typeof obj.traits === 'object' ? Object.keys(obj.traits) : [];
  const weightsKeys = obj.evaluation_weights && typeof obj.evaluation_weights === 'object' ? Object.keys(obj.evaluation_weights) : [];
  return [
    `Top-level keys: ${keys.join(', ')}`,
    `Types: ${types.join(', ')}`,
    traitsKeys.length ? `traits keys: ${traitsKeys.join(', ')}` : '',
    weightsKeys.length ? `evaluation_weights keys: ${weightsKeys.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

module.exports = {
  validateUniversityEntry,
  describeStructure,
  validateOptionalEnrichment,
  REQUIRED_KEYS,
  REQUIRED_TRAIT_KEYS,
  REQUIRED_WEIGHT_KEYS,
};
