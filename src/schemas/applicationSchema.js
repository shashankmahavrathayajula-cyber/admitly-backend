/**
 * Validation for the evaluateApplication request body.
 * Keeps the API contract clear and returns 400 when required fields are missing.
 */

function validateEvaluateRequest(body) {
  const errors = [];

  if (body === null || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be a JSON object'] };
  }

  if (!('application' in body)) {
    errors.push('Missing required field: "application"');
  } else if (typeof body.application !== 'object' || body.application === null) {
    errors.push('"application" must be an object');
  }

  if (!('universities' in body)) {
    errors.push('Missing required field: "universities"');
  } else if (!Array.isArray(body.universities)) {
    errors.push('"universities" must be an array of strings');
  } else if (body.universities.length === 0) {
    errors.push('"universities" must contain at least one university name');
  } else if (!body.universities.every((u) => typeof u === 'string' && u.trim().length > 0)) {
    errors.push('"universities" must contain non-empty strings');
  }

  return {
    valid: errors.length === 0,
    errors: errors.length ? errors : undefined,
  };
}

module.exports = {
  validateEvaluateRequest,
};
