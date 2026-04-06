/**
 * Compact application payloads for prompts — avoids dumping full JSON into the model.
 */

function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj != null && k in obj && obj[k] !== undefined && obj[k] !== '') out[k] = obj[k];
  }
  return out;
}

/**
 * Academic-relevant fields only.
 */
function buildAcademicExcerpt(applicationProfile) {
  const a = applicationProfile?.academics;
  return pick(
    {
      gpa: applicationProfile?.gpa ?? applicationProfile?.GPA ?? a?.gpa,
      courseRigor:
        applicationProfile?.courseRigor ??
        applicationProfile?.course_rigor ??
        a?.courseRigor ??
        a?.course_rigor,
      apCourses:
        applicationProfile?.apCourses ??
        applicationProfile?.honorsCourses ??
        a?.apCourses ??
        a?.honorsCourses,
      /** Structured SAT/ACT after normalizeApplicationInput; backward compat: omit if absent */
      tests: applicationProfile?.tests ?? a?.tests,
    },
    ['gpa', 'courseRigor', 'apCourses', 'tests']
  );
}

function buildActivitiesExcerpt(applicationProfile) {
  const raw = applicationProfile?.activities ?? applicationProfile?.extracurriculars ?? [];
  const list = Array.isArray(raw) ? raw : [];
  return {
    count: list.length,
    items: list.slice(0, 8).map((x) =>
      pick(x, ['name', 'title', 'role', 'type', 'description', 'details', 'years', 'yearsActive', 'isLeadership'])
    ),
    leadershipRoles: applicationProfile?.leadershipRoles ?? applicationProfile?.leadership,
  };
}

function buildHonorsExcerpt(applicationProfile) {
  const raw = applicationProfile?.honors ?? applicationProfile?.awards ?? [];
  const list = Array.isArray(raw) ? raw : [];
  return { items: list.slice(0, 10) };
}

/**
 * Essay / narrative text only (character-capped for token safety).
 */
function buildEssayNarrativeExcerpt(applicationProfile, maxChars = 6500) {
  const chunks = [];
  const essays = applicationProfile?.essays;
  if (essays && typeof essays === 'object') {
    if (typeof essays.personalStatement === 'string' && essays.personalStatement.trim()) {
      chunks.push(`[personalStatement]\n${essays.personalStatement.trim()}`);
    }
    if (typeof essays.supplemental === 'string' && essays.supplemental.trim()) {
      chunks.push(`[supplemental]\n${essays.supplemental.trim()}`);
    }
  }
  if (typeof applicationProfile?.essay === 'string' && applicationProfile.essay.trim()) {
    chunks.push(`[essay]\n${applicationProfile.essay.trim()}`);
  }
  if (typeof applicationProfile?.personalStatement === 'string' && applicationProfile.personalStatement.trim()) {
    chunks.push(`[personalStatement]\n${applicationProfile.personalStatement.trim()}`);
  }
  const themes = applicationProfile?.narrativeThemes ?? applicationProfile?.themes;
  const themeLine =
    Array.isArray(themes) && themes.length
      ? `\n[declared_themes]\n${themes.join('; ')}`
      : '';

  let body = chunks.join('\n\n') + themeLine;
  if (body.length > maxChars) {
    body = `${body.slice(0, maxChars)}\n\n[truncated for length]`;
  }
  return {
    intendedMajor: applicationProfile?.intendedMajor ?? applicationProfile?.intended_major ?? applicationProfile?.major,
    narrative_excerpt: body || '[No essay or personal statement text was provided.]',
  };
}

function buildFitExcerpt(applicationProfile) {
  return pick(applicationProfile, [
    'intendedMajor',
    'intended_major',
    'major',
    'background',
    'values',
    'interests',
  ]);
}

/**
 * Institutional fit: major + compact activities (authoritative for "does student show CS/leadership?").
 */
function buildInstitutionalFitContext(applicationProfile) {
  const a = applicationProfile?.academics;
  const intendedMajor =
    applicationProfile?.intendedMajor ??
    applicationProfile?.intended_major ??
    applicationProfile?.major ??
    a?.intendedMajor ??
    a?.intended_major ??
    '';
  const act = buildActivitiesExcerpt(applicationProfile);
  return {
    intendedMajor,
    activities: act.items,
    activityCount: act.count,
  };
}

module.exports = {
  buildAcademicExcerpt,
  buildActivitiesExcerpt,
  buildHonorsExcerpt,
  buildEssayNarrativeExcerpt,
  buildFitExcerpt,
  buildInstitutionalFitContext,
};
