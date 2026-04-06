/**
 * CDS-aligned handling of SAT/ACT for academic subscore.
 * Test scores never replace GPA/rigor; they add a small capped signal when policy allows.
 */

/** @typedef {'test_blind'|'test_optional'|'test_required'|'not_used'} TestingPolicy */

/**
 * Resolve policy from explicit university.standardized_testing.policy or culture_notes heuristics.
 * @param {object} universityProfile
 * @returns {TestingPolicy}
 */
function getStandardizedTestingPolicy(universityProfile) {
  const st = universityProfile?.standardized_testing;
  if (st && typeof st === 'object' && typeof st.policy === 'string') {
    const p = st.policy.trim();
    if (
      ['test_blind', 'test_optional', 'test_required', 'not_used'].includes(p)
    ) {
      return /** @type {TestingPolicy} */ (p);
    }
  }
  const blob = [
    ...(Array.isArray(universityProfile?.culture_notes) ? universityProfile.culture_notes : []),
    typeof universityProfile?.summary === 'string' ? universityProfile.summary : '',
  ].join(' ');
  if (/test[- ]?blind|does not consider.*sat|sat\/act.*not.*consider/i.test(blob)) {
    return 'test_blind';
  }
  if (/test[- ]?optional|sat\/act.*optional/i.test(blob)) {
    return 'test_optional';
  }
  return 'test_optional';
}

/**
 * @param {object|null|undefined} tests - normalized tests object
 * @returns {{ sat?: { total?: number }, act?: { composite?: number } }|null}
 */
function compactTestsForScoring(tests) {
  if (!tests || typeof tests !== 'object') return null;
  const out = {};
  if (tests.sat && typeof tests.sat === 'object') {
    const t = tests.sat.total;
    const total = typeof t === 'number' && !Number.isNaN(t) ? t : parseFloat(t);
    if (typeof total === 'number' && !Number.isNaN(total)) out.sat = { total };
  }
  if (tests.act && typeof tests.act === 'object') {
    const c = tests.act.composite;
    const comp = typeof c === 'number' && !Number.isNaN(c) ? c : parseFloat(c);
    if (typeof comp === 'number' && !Number.isNaN(comp)) out.act = { composite: comp };
  }
  if (!out.sat && !out.act) return null;
  return out;
}

/**
 * Small capped bump for rule-based academic score: up to +0.5 for strong scores, or -0.35 for weak
 * scores at test_required schools. Never applied when test_blind / not_used.
 * @returns {number}
 */
function academicScoreBumpFromTests(tests, policy) {
  if (policy === 'test_blind' || policy === 'not_used') return 0;
  const c = compactTestsForScoring(tests);
  if (!c) return 0;

  let tier = 0;
  if (c.sat?.total != null) {
    const s = c.sat.total;
    if (s >= 1500) tier = 2;
    else if (s >= 1350) tier = 1;
  }
  if (c.act?.composite != null) {
    const a = c.act.composite;
    if (a >= 34) tier = Math.max(tier, 2);
    else if (a >= 30) tier = Math.max(tier, 1);
  }

  if (tier === 0) {
    if (policy === 'test_required') {
      const weakSat = c.sat?.total != null && c.sat.total < 1100;
      const weakAct = c.act?.composite != null && c.act.composite < 22;
      if (weakSat || weakAct) return -0.35;
    }
    return 0;
  }
  if (policy === 'test_required') {
    return tier === 2 ? 0.5 : 0.35;
  }
  // test_optional: smaller marginal value
  return tier === 2 ? 0.35 : 0.2;
}

module.exports = {
  getStandardizedTestingPolicy,
  compactTestsForScoring,
  academicScoreBumpFromTests,
};
