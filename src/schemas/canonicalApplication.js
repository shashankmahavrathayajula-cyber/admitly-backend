/**
 * Canonical application shape for evaluation (Admitly v1).
 *
 * WHY THIS EXISTS
 * - Frontend (Lovable) may send nested `academics` + flat legacy fields.
 * - Analyzers historically read flat `gpa`, `courseRigor`, `intendedMajor`.
 * - normalizeApplicationInput() merges nested + flat into one consistent object
 *   so analyzers and excerpts see the same signals without duplicating logic.
 *
 * CONTRACT (document for Lovable / API clients)
 * - `academics`: { gpa?, courseRigor?, intendedMajor?, tests? } — preferred envelope
 * - Flat mirrors: gpa, courseRigor, intendedMajor — still supported
 * - `tests` (optional): { sat?: { total?, ebrw?, math? }, act?: { composite?, english?, math?, reading?, science? } }
 *   — may also appear as academics.tests; normalized to top-level `tests` for analyzers.
 * - `activities[]`: { name, role, description, yearsActive?, isLeadership?, ... }
 * - `honors[]`: { title, level, year }
 * - `essays`: { personalStatement }
 *
 * courseRigor (UI): 'standard' | 'honors' | 'ap_ib' | 'most_demanding' | ''
 */

/** Parse AP count from API (number or numeric string); null if absent/invalid. */
function coerceNonNegativeInt(val) {
  if (val == null || val === '') return null;
  const n = typeof val === 'number' ? val : parseInt(String(val).trim(), 10);
  if (Number.isNaN(n) || n < 0) return null;
  return n;
}

/** When course rigor dropdown is empty, infer from AP count (aligns with academic UX). */
function deriveCourseRigorFromApCount(apTaken) {
  if (apTaken == null) return null;
  if (apTaken >= 4) return 'ap_ib';
  if (apTaken >= 1) return 'honors';
  return 'standard';
}

function normalizeTestsObject(raw) {
  const t =
    raw?.tests ??
    raw?.testScores ??
    raw?.academics?.tests ??
    raw?.academics?.testScores ??
    null;
  if (t === null || typeof t !== 'object') return null;

  const num = (v) => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return typeof n === 'number' && !Number.isNaN(n) ? n : undefined;
  };

  const satIn = t.sat && typeof t.sat === 'object' ? t.sat : null;
  const actIn = t.act && typeof t.act === 'object' ? t.act : null;

  const sat =
    satIn &&
    (satIn.total != null || satIn.ebrw != null || satIn.math != null)
      ? {
          ...(num(satIn.total) != null ? { total: num(satIn.total) } : {}),
          ...(num(satIn.ebrw) != null ? { ebrw: num(satIn.ebrw) } : {}),
          ...(num(satIn.math) != null ? { math: num(satIn.math) } : {}),
        }
      : null;

  const act =
    actIn &&
    (actIn.composite != null ||
      actIn.english != null ||
      actIn.math != null ||
      actIn.reading != null ||
      actIn.science != null)
      ? {
          ...(num(actIn.composite) != null ? { composite: num(actIn.composite) } : {}),
          ...(num(actIn.english) != null ? { english: num(actIn.english) } : {}),
          ...(num(actIn.math) != null ? { math: num(actIn.math) } : {}),
          ...(num(actIn.reading) != null ? { reading: num(actIn.reading) } : {}),
          ...(num(actIn.science) != null ? { science: num(actIn.science) } : {}),
        }
      : null;

  const out = {};
  if (sat && Object.keys(sat).length > 0) out.sat = sat;
  if (act && Object.keys(act).length > 0) out.act = act;
  if (!out.sat && !out.act) return null;
  return out;
}

function normalizeApplicationInput(raw) {
  if (raw === null || typeof raw !== 'object') {
    return {};
  }

  const academics = raw.academics && typeof raw.academics === 'object' ? raw.academics : {};

  const gpa = raw.gpa ?? raw.GPA ?? academics.gpa ?? null;
  let courseRigor =
    raw.courseRigor ?? raw.course_rigor ?? academics.courseRigor ?? academics.course_rigor ?? null;
  const apCoursesTakenRaw =
    raw.apCoursesTaken ?? raw.academics?.apCoursesTaken ?? academics.apCoursesTaken ?? null;
  const apCoursesAvailableRaw =
    raw.apCoursesAvailable ?? raw.academics?.apCoursesAvailable ?? academics.apCoursesAvailable ?? null;
  const apCoursesTaken = coerceNonNegativeInt(apCoursesTakenRaw);
  const apCoursesAvailable = coerceNonNegativeInt(apCoursesAvailableRaw);

  const rigorUnset =
    courseRigor == null || (typeof courseRigor === 'string' && !String(courseRigor).trim());
  if (rigorUnset && apCoursesTaken != null) {
    courseRigor = deriveCourseRigorFromApCount(apCoursesTaken);
  }
  const intendedMajor =
    (typeof raw.intendedMajor === 'string' && raw.intendedMajor) ||
    (typeof raw.intended_major === 'string' && raw.intended_major) ||
    (typeof academics.intendedMajor === 'string' && academics.intendedMajor) ||
    (typeof academics.intended_major === 'string' && academics.intended_major) ||
    '';

  const essays = raw.essays && typeof raw.essays === 'object' ? { ...raw.essays } : {};
  if (!essays.personalStatement && typeof raw.personalStatement === 'string') {
    essays.personalStatement = raw.personalStatement;
  }

  const apCourses =
    raw.apCourses ?? raw.honorsCourses ?? academics.apCourses ?? academics.honorsCourses ?? null;

  const tests = normalizeTestsObject({ ...raw, academics: { ...academics } });

  return {
    ...raw,
    academics: {
      ...academics,
      gpa: academics.gpa !== undefined ? academics.gpa : gpa,
      courseRigor: courseRigor != null ? courseRigor : academics.courseRigor,
      intendedMajor: academics.intendedMajor !== undefined ? academics.intendedMajor : intendedMajor,
      ...(apCourses != null ? { apCourses } : {}),
      apCoursesTaken,
      apCoursesAvailable,
      ...(tests ? { tests } : {}),
    },
    gpa,
    courseRigor,
    intendedMajor,
    ...(apCourses != null ? { apCourses } : {}),
    apCoursesTaken,
    apCoursesAvailable,
    ...(tests ? { tests } : {}),
    essays,
    activities: Array.isArray(raw.activities) ? raw.activities : [],
    honors: Array.isArray(raw.honors) ? raw.honors : [],
  };
}

/**
 * True if student indicated something above baseline course load.
 * @param {object} app - normalized application
 */
function courseRigorIndicated(app) {
  const cr = app?.courseRigor ?? app?.academics?.courseRigor;
  if (typeof cr === 'string' && cr.trim() && cr !== 'standard') return true;
  const taken = coerceNonNegativeInt(app?.apCoursesTaken ?? app?.academics?.apCoursesTaken);
  if (taken != null && taken > 0) return true;
  const ap =
    app?.apCourses ?? app?.honorsCourses ?? app?.academics?.apCourses ?? app?.academics?.honorsCourses;
  return Array.isArray(ap) && ap.length > 0;
}

module.exports = {
  normalizeApplicationInput,
  courseRigorIndicated,
  normalizeTestsObject,
};
