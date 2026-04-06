/**
 * Major ↔ university "major_strengths" matching with broad STEM overlap.
 * Avoids false "no alignment" when the catalog lists "Engineering" but the student says "Computer Science".
 */

function normalizeMajor(s) {
  return typeof s === 'string' ? s.trim().toLowerCase() : '';
}

/** Student major reads as computing / STEM-heavy. */
function isStemOrComputingMajor(majorNorm) {
  if (!majorNorm) return false;
  return (
    /computer|computing|software|data scien|cyber|electrical|mechanical|civil|aerospace|physics|statistics|mathematics|math\b|engineering|bioeng|chemical engine/.test(
      majorNorm
    ) || majorNorm === 'cs'
  );
}

/** Catalog line looks STEM / engineering / computing. */
function strengthLooksStemOrComputing(strengthNorm) {
  return /engineer|computer|data science|physics|mathematics|math|chemistry|biology|stem|nursing|health science|veterinary|agriculture|food science|environmental/.test(
    strengthNorm
  );
}

/**
 * @param {string} intendedMajor
 * @param {string[]} majorStrengths - from university profile
 * @returns {{ matched: boolean, matchKind: 'direct'|'stem_bridge'|'none' }}
 */
function matchIntendedMajorToStrengths(intendedMajor, majorStrengths) {
  const m = normalizeMajor(intendedMajor);
  const list = Array.isArray(majorStrengths) ? majorStrengths : [];
  if (!m) return { matched: false, matchKind: 'none' };

  const direct = list.some((s) => {
    const sl = normalizeMajor(s);
    return sl && (m.includes(sl) || sl.includes(m));
  });
  if (direct) return { matched: true, matchKind: 'direct' };

  if (isStemOrComputingMajor(m)) {
    const bridge = list.some((s) => strengthLooksStemOrComputing(normalizeMajor(s)));
    if (bridge) return { matched: true, matchKind: 'stem_bridge' };
  }

  return { matched: false, matchKind: 'none' };
}

/**
 * Cheap scan of activities for STEM / leadership signals (uses existing fields only).
 */
function summarizeStemAndLeadershipSignals(applicationProfile) {
  const raw = applicationProfile?.activities ?? applicationProfile?.extracurriculars ?? [];
  const list = Array.isArray(raw) ? raw : [];
  const blob = list
    .map((a) =>
      [a?.name, a?.role, a?.title, a?.type, a?.description, a?.details].filter(Boolean).join(' ')
    )
    .join(' ')
    .toLowerCase();

  const stemCue = /code|coding|robot|software|hackathon|hack|programming|cs\b|computer|stem|science olympiad|physics/.test(
    blob
  );
  const founderCue = /founder|co-?founder|started|launched|created the|president|vice\s+president|captain|\bleader\b|team\s+lead|lead\b|director|officer|chair/.test(
    blob
  );
  let yearsHigh = false;
  for (const a of list) {
    const y = Number(a?.yearsActive ?? a?.years ?? 0);
    if (y >= 2) yearsHigh = true;
  }
  const leadershipFlag = list.some((a) => a?.isLeadership);

  return {
    activityCount: list.length,
    stemCue,
    founderCue,
    yearsHigh,
    leadershipFlag,
  };
}

module.exports = {
  matchIntendedMajorToStrengths,
  summarizeStemAndLeadershipSignals,
  isStemOrComputingMajor,
};
