/**
 * Strip aggregated bullets that contradict obvious structured application facts.
 * Runs after all analyzers merge — fixes AI/prompt drift in any single analyzer.
 */

const { normalizeApplicationInput } = require('../schemas/canonicalApplication');
const { summarizeStemAndLeadershipSignals } = require('./majorFitHelpers');

function normalizedIntendedMajor(app) {
  const m =
    app?.intendedMajor ??
    app?.intended_major ??
    app?.major ??
    app?.academics?.intendedMajor ??
    app?.academics?.intended_major ??
    '';
  return typeof m === 'string' ? m.trim() : '';
}

/** True when the line is clearly about written materials, not the whole file. */
function isEssayOrWritingScoped(text) {
  return /\b(essay|essays|personal statement|coalition|supplemental|written materials|narrative|writing|excerpt)\b/i.test(
    text
  );
}

/**
 * When intended major is on file, drop lines that falsely deny the application mentions a major.
 * Keeps essay-scoped critiques (e.g. PS does not tie to CS).
 */
function contradictsDeclaredMajor(line, intendedStr) {
  if (!intendedStr) return false;
  if (isEssayOrWritingScoped(line)) return false;
  return (
    /\bno\s+mention\s+of\s+(the\s+)?intended\s+major\b/i.test(line) ||
    /\bthere\s+is\s+no\s+mention\s+of\s+(the\s+)?(intended\s+)?major\b/i.test(line) ||
    /\b(no|lacks)\s+(any\s+)?mention\s+of\s+(the\s+)?intended\s+major\b/i.test(line) ||
    /\bno\s+mention\s+of\s+(the\s+)?intended\s+major\s+or\s+familiarity\b/i.test(line) ||
    /\bno\s+mention\s+of\s+(the\s+)?major\s+or\s+familiarity\s+with\s+program/i.test(line) ||
    /\bno\s+mention\s+of\s+(the\s+)?major\s+or\s+familiarity\s+with\s+program\s+prerequisites/i.test(line)
  );
}

/**
 * When activities show leadership/founder signals, drop lines that deny leadership in ECs.
 * Keeps essay-scoped lines.
 */
function contradictsDeclaredLeadership(line, sig) {
  const has = sig.founderCue || sig.leadershipFlag;
  if (!has) return false;
  if (isEssayOrWritingScoped(line)) return false;
  return (
    /\bno\s+evidence\s+of\s+sustained\s+leadership\b/i.test(line) ||
    /\bno\s+sustained\s+leadership\b/i.test(line) ||
    /\bno\s+evidence\s+of\s+sustained\s+leadership\s+or\s+impact\b/i.test(line) ||
    /\bno\s+leadership\s+in\s+extracurricular/i.test(line) ||
    /\bno\s+evidence\s+of\s+.*\bleadership\b.*\bextracurricular/i.test(line)
  );
}

function stemishMajor(intendedStr) {
  return /computer|software|computing|data scien|cyber|engineer|stem|math|physics|statistics/i.test(
    intendedStr
  );
}

/**
 * When major + STEM ECs exist, drop fit lines that deny CS/program engagement at application level.
 */
function contradictsStemActivityEngagement(line, intendedStr, sig) {
  if (!intendedStr || !sig.stemCue) return false;
  if (!stemishMajor(intendedStr)) return false;
  if (isEssayOrWritingScoped(line)) return false;
  return (
    /\bno\s+references?\s+to\s+.*\bcomputer\s+science\b/i.test(line) ||
    /\bno\s+references?\s+to\s+how\s+the\s+applicant\s+plans\s+to\s+engage\b/i.test(line) ||
    /\binsufficient\s+text\s+to\s+assess\s+.*land-grant\s+fit.*computer\s+science/i.test(line) ||
    /\binsufficient\s+text\s+to\s+assess\s+.*program\s+realism.*computer\s+science/i.test(line)
  );
}

/** ap_ib / honors / most_demanding on file — not 'standard' or empty. */
function highCourseRigorOnFile(app) {
  const cr = app?.courseRigor ?? app?.academics?.courseRigor;
  if (typeof cr !== 'string') return false;
  const v = cr.trim().toLowerCase();
  return v === 'ap_ib' || v === 'honors' || v === 'most_demanding';
}

/**
 * When rigorous coursework is declared, drop lines that falsely claim there is no AP/honors/rigor.
 * (weaknesses + suggestions only)
 */
function contradictsDeclaredCourseRigor(line, app) {
  if (!highCourseRigorOnFile(app)) return false;
  return (
    /less emphasis on academic coursework such as AP/i.test(line) ||
    /no advanced coursework/i.test(line) ||
    /lacks rigorous course/i.test(line) ||
    /no AP or honors/i.test(line) ||
    /limited course rigor/i.test(line)
  );
}

/**
 * When honors entries exist, drop lines that falsely claim there are no awards/honors.
 * (weaknesses + suggestions only)
 */
function contradictsDeclaredHonors(line, app) {
  const honors = app?.honors;
  if (!Array.isArray(honors) || honors.length === 0) return false;
  return (
    /absence of specific awards/i.test(line) ||
    /no awards or recognitions/i.test(line) ||
    /\blacks awards\b/i.test(line) ||
    /no honors listed/i.test(line) ||
    /does not include awards/i.test(line)
  );
}

function filterList(lines, app, kind) {
  const intended = normalizedIntendedMajor(app);
  const sig = summarizeStemAndLeadershipSignals(app);
  return (lines || []).filter((line) => {
    if (typeof line !== 'string' || !line.trim()) return false;
    if (contradictsDeclaredMajor(line, intended)) return false;
    if (contradictsDeclaredLeadership(line, sig)) return false;
    if (contradictsStemActivityEngagement(line, intended, sig)) return false;
    if (kind !== 'strengths') {
      if (contradictsDeclaredCourseRigor(line, app)) return false;
      if (contradictsDeclaredHonors(line, app)) return false;
    }
    if (kind === 'suggestions' && intended && /\bspecify\s+(your\s+)?intended\s+major\b/i.test(line)) {
      return false;
    }
    return true;
  });
}

/**
 * @param {object} aggregated - output of aggregate() (strengths/weaknesses/suggestions arrays)
 * @param {object} applicationProfile - raw or normalized application
 * @returns {{ strengths: string[], weaknesses: string[], suggestions: string[] }}
 */
function applyStructuredInputGuards(aggregated, applicationProfile) {
  const app = normalizeApplicationInput(applicationProfile);
  return {
    strengths: filterList(aggregated.strengths, app, 'strengths'),
    weaknesses: filterList(aggregated.weaknesses, app, 'weaknesses'),
    suggestions: filterList(aggregated.suggestions, app, 'suggestions'),
  };
}

module.exports = {
  applyStructuredInputGuards,
  normalizedIntendedMajor,
};
