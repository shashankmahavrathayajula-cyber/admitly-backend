/**
 * Analyzer-specific views of a university profile.
 * Do not pass full dataset blobs into prompts — only what each step needs.
 */

/**
 * Normalize ranked priorities: enriched objects, or fallback from culture_notes.
 * @param {object} universityProfile
 * @returns {{ theme: string, reader_looks_for: string }[]}
 */
function getSchoolPriorities(universityProfile) {
  const raw = universityProfile?.school_priorities;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map((p) => {
        if (p && typeof p === 'object' && typeof p.theme === 'string' && typeof p.reader_looks_for === 'string') {
          return { theme: p.theme.trim(), reader_looks_for: p.reader_looks_for.trim() };
        }
        return null;
      })
      .filter(Boolean);
  }
  const notes = universityProfile?.culture_notes;
  if (Array.isArray(notes) && notes.length > 0) {
    return notes.slice(0, 6).map((text, i) => ({
      theme: `Institutional context ${i + 1}`,
      reader_looks_for: text,
    }));
  }
  return [{ theme: 'General fit', reader_looks_for: universityProfile?.summary || 'Holistic review.' }];
}

function sliceForAcademic(universityProfile) {
  const st = universityProfile?.standardized_testing;
  return {
    name: universityProfile?.name,
    selectivity_level: universityProfile?.selectivity_level,
    acceptance_rate_estimate: universityProfile?.acceptance_rate_estimate,
    academic_rigor_importance: universityProfile?.academic_rigor_importance,
    evaluation_weights: universityProfile?.evaluation_weights,
    standardized_testing: st && typeof st === 'object' ? { policy: st.policy, reviewer_note: st.reviewer_note } : undefined,
    traits: universityProfile?.traits
      ? {
          academic_rigor: universityProfile.traits.academic_rigor,
          intellectual_vitality: universityProfile.traits.intellectual_vitality,
        }
      : undefined,
    school_priorities: getSchoolPriorities(universityProfile).slice(0, 5),
    anti_patterns: universityProfile?.anti_patterns || [],
  };
}

function sliceForActivities(universityProfile) {
  return {
    name: universityProfile?.name,
    extracurricular_importance: universityProfile?.extracurricular_importance,
    traits: universityProfile?.traits
      ? {
          leadership: universityProfile.traits.leadership,
          collaboration: universityProfile.traits.collaboration,
          community_impact: universityProfile.traits.community_impact,
          initiative: universityProfile.traits.initiative,
        }
      : undefined,
    school_priorities: getSchoolPriorities(universityProfile).slice(0, 5),
    anti_patterns: universityProfile?.anti_patterns || [],
    institutional_tone: universityProfile?.institutional_tone || '',
  };
}

function sliceForHonors(universityProfile) {
  return {
    name: universityProfile?.name,
    selectivity_level: universityProfile?.selectivity_level,
    school_priorities: getSchoolPriorities(universityProfile).slice(0, 4),
    anti_patterns: universityProfile?.anti_patterns || [],
  };
}

/**
 * Narrative / essay — tone + priorities + anti-slop signals (highest leverage slice).
 */
function sliceForNarrative(universityProfile) {
  return {
    name: universityProfile?.name,
    essay_importance: universityProfile?.essay_importance,
    school_priorities: getSchoolPriorities(universityProfile),
    institutional_tone: universityProfile?.institutional_tone || '',
    anti_patterns: universityProfile?.anti_patterns || [],
    traits: universityProfile?.traits
      ? {
          reflection_depth: universityProfile.traits.reflection_depth,
          thematic_direction: universityProfile.traits.thematic_direction,
          intellectual_vitality: universityProfile.traits.intellectual_vitality,
        }
      : undefined,
    culture_notes_compact: Array.isArray(universityProfile?.culture_notes)
      ? universityProfile.culture_notes.slice(0, 5)
      : [],
  };
}

function sliceForInstitutionalFit(universityProfile) {
  return {
    name: universityProfile?.name,
    location: universityProfile?.location,
    selectivity_level: universityProfile?.selectivity_level,
    acceptance_rate_estimate: universityProfile?.acceptance_rate_estimate,
    major_strengths: universityProfile?.major_strengths || [],
    school_priorities: getSchoolPriorities(universityProfile).slice(0, 6),
    institutional_tone: universityProfile?.institutional_tone || '',
    anti_patterns: universityProfile?.anti_patterns || [],
    culture_notes_compact: Array.isArray(universityProfile?.culture_notes)
      ? universityProfile.culture_notes.slice(0, 5)
      : [],
    summary_compact: typeof universityProfile?.summary === 'string' ? universityProfile.summary.slice(0, 600) : '',
  };
}

/**
 * Executive synthesis — priorities + tone + essay weight + place (no raw application dump).
 * essay_importance + location make UW vs WSU contrast explicit for the dean prompt.
 */
function sliceForSynthesis(universityProfile) {
  const st = universityProfile?.standardized_testing;
  return {
    name: universityProfile?.name,
    location: universityProfile?.location,
    selectivity_level: universityProfile?.selectivity_level,
    acceptance_rate_estimate: universityProfile?.acceptance_rate_estimate,
    essay_importance: universityProfile?.essay_importance,
    standardized_testing_policy: st?.policy || undefined,
    school_priorities: getSchoolPriorities(universityProfile).slice(0, 5),
    institutional_tone: universityProfile?.institutional_tone || '',
    anti_patterns: (universityProfile?.anti_patterns || []).slice(0, 6),
  };
}

module.exports = {
  getSchoolPriorities,
  sliceForAcademic,
  sliceForActivities,
  sliceForHonors,
  sliceForNarrative,
  sliceForInstitutionalFit,
  sliceForSynthesis,
};
