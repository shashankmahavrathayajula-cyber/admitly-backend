const { computeRigorFromCourses } = require('./benchmarkScoring');

/**
 * Cross-dimension coherence assessment.
 * Runs after individual analyzers, adjusts the alignment score
 * and adds coherence-specific feedback.
 *
 * Rewards profiles that tell a unified story.
 * Penalizes mismatches that suggest padding or lack of direction.
 */

/**
 * @param {object} application - Normalized application profile
 * @param {object} dimensionScores - { academic, activities, honors, narrative, institutionalFit }
 * @param {object} universityProfile - Full university schema
 * @returns {{ bonus: number, penalty: number, strengths: string[], weaknesses: string[] }}
 */
function assessCoherence(application, dimensionScores, universityProfile) {
  let bonus = 0;
  let penalty = 0;
  const strengths = [];
  const weaknesses = [];

  const major = (
    application.intendedMajor ||
    application.intended_major ||
    application.major ||
    application.academics?.intendedMajor ||
    ''
  ).trim();

  const activities = application.activities || application.extracurriculars || [];
  const activityList = Array.isArray(activities) ? activities : [];

  const essayText = (
    application.essays?.personalStatement ||
    application.personalStatement ||
    application.essay ||
    ''
  ).toLowerCase();

  const gpa = application.gpa ?? application.academics?.gpa;
  const rigorComputed = computeRigorFromCourses(application);
  const rigor =
    rigorComputed || application.courseRigor || application.academics?.courseRigor || '';
  const schoolName = universityProfile?.name || 'this institution';

  // ── 1. Major-Activity Alignment ──
  // Do activities support the intended major?
  if (major) {
    const majorLower = major.toLowerCase();
    const majorKeywords = majorLower.split(/\s+/).filter(w => w.length > 3);

    const relatedActivities = activityList.filter(a => {
      const text = `${a.name || ''} ${a.role || ''} ${a.description || ''}`.toLowerCase();
      // Check for keyword overlap or common STEM/field signals
      return majorKeywords.some(kw => text.includes(kw)) ||
        (isStemMajor(major) && /code|coding|robot|program|hack|software|data|math|science|engineer|research|lab|comput/i.test(text)) ||
        (isBusinessMajor(major) && /business|market|finance|entrepreneur|invest|economic|manage|consult/i.test(text)) ||
        (isArtsMajor(major) && /art|music|film|theater|theatre|write|writing|creative|design|perform/i.test(text));
    });

    if (relatedActivities.length >= 2) {
      bonus += 0.4;
      strengths.push(`Activities directly support the intended major (${major}) — the profile tells a coherent story.`);
    } else if (relatedActivities.length === 1) {
      bonus += 0.15;
    } else if (activityList.length > 0) {
      penalty += 0.25;
      weaknesses.push(`None of the listed activities clearly connect to the intended major (${major}). Admissions readers at ${schoolName} look for a thread between interests and actions.`);
    }
  }

  // ── 2. Rigor-GPA Consistency ──
  // High GPA + no rigor = grade inflation signal
  // High rigor + good GPA = strong preparation signal
  if (typeof gpa === 'number' && !Number.isNaN(gpa)) {
    const isHighRigor = ['most_demanding', 'ap_ib'].includes(String(rigor).toLowerCase());
    const isLowRigor = ['standard', ''].includes(String(rigor).toLowerCase());

    if (gpa >= 3.8 && isLowRigor) {
      penalty += 0.2;
      weaknesses.push('Strong GPA without demanding coursework may signal limited academic challenge — readers at selective schools notice this pattern.');
    } else if (gpa >= 3.7 && isHighRigor) {
      bonus += 0.25;
      strengths.push('Strong GPA in rigorous coursework demonstrates genuine academic preparation.');
    } else if (gpa < 3.3 && isHighRigor) {
      // Took hard classes but struggled — show resilience
      bonus += 0.1;
      strengths.push('Taking demanding courses despite a moderate GPA shows willingness to challenge yourself.');
    }
  }

  // ── 3. Essay References Activities ──
  // Does the essay mention specific activities by name?
  if (essayText.length > 50 && activityList.length > 0) {
    const essayMentionsActivity = activityList.some(a => {
      const name = (a.name || '').toLowerCase();
      return name.length > 3 && essayText.includes(name);
    });

    if (essayMentionsActivity) {
      bonus += 0.2;
      strengths.push('The essay connects to specific activities — this creates narrative cohesion that readers value.');
    }
  }

  // ── 4. Leadership Depth vs Breadth ──
  // Sustained leadership in fewer activities > thin titles across many
  if (activityList.length > 0) {
    const leadershipActivities = activityList.filter(a =>
      a.isLeadership ||
      /president|captain|founder|lead|director|officer|chair|head/i.test(String(a.role || ''))
    );
    const avgLeaderYears = leadershipActivities.length > 0
      ? leadershipActivities.reduce((s, a) => s + (a.yearsActive || 1), 0) / leadershipActivities.length
      : 0;

    if (leadershipActivities.length >= 2 && avgLeaderYears >= 2.5) {
      bonus += 0.25;
      strengths.push('Sustained leadership across multiple years demonstrates commitment, not just title collection.');
    } else if (activityList.length >= 4 && leadershipActivities.length === 0) {
      penalty += 0.15;
      weaknesses.push('Multiple activities but no leadership roles — consider how to show initiative and ownership.');
    }
  }

  // ── 5. Empty Dimension Penalty ──
  // Having a completely empty dimension is worse than a low score
  const emptyDimensions = [];
  if (activityList.length === 0) emptyDimensions.push('activities');
  if ((application.honors || []).length === 0) emptyDimensions.push('honors');
  if (essayText.length < 20) emptyDimensions.push('narrative');
  if (!major) emptyDimensions.push('intended major');

  if (emptyDimensions.length >= 2) {
    penalty += 0.3;
    weaknesses.push(`Multiple dimensions are empty (${emptyDimensions.join(', ')}). A complete profile is essential for a meaningful evaluation.`);
  }

  return {
    bonus: Math.round(bonus * 100) / 100,
    penalty: Math.round(penalty * 100) / 100,
    strengths,
    weaknesses,
  };
}

function isStemMajor(major) {
  return /computer|computing|software|data|cyber|engineer|physics|math|statistics|stem|biology|chemistry|science/i.test(major);
}

function isBusinessMajor(major) {
  return /business|economics|finance|marketing|management|accounting|entrepreneur/i.test(major);
}

function isArtsMajor(major) {
  return /art|music|film|theater|theatre|english|creative writing|design|communications|journalism/i.test(major);
}

module.exports = { assessCoherence };
