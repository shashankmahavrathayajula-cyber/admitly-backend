/**
 * Gap Analysis Engine — Admitly's strategic action planning system.
 *
 * Produces a school-specific action plan by:
 * 1. Computing exact dimensional gaps against benchmarks
 * 2. Ranking gaps by weighted impact on alignment score
 * 3. Categorizing what's changeable vs locked
 * 4. Generating specific, time-bound actions via LLM
 * 5. Identifying compound actions that improve multiple dimensions
 *
 * This is the "admissions counselor in a box" — the output should rival
 * what a student gets from a $300/hour private session.
 */

const openaiClient = require('../utils/openaiClient');
const { getSchoolPriorities } = require('./universitySlices');
const { applyOutputGuards } = require('./outputGuards');
const { effectiveAdmitRate } = require('./universitySignals');

// ════════════════════════════════════════════════
// LAYER 1: Gap Computation (pure math, no LLM)
// ════════════════════════════════════════════════

/**
 * Dimension metadata for display and weight lookup.
 */
const DIMENSIONS = {
  academic: {
    label: 'Academic Preparation',
    changeable: 'limited',
    changeNote: 'GPA and course rigor are mostly locked by senior year. Test scores may have one more attempt.',
    aggregatorKey: 'academic',
  },
  activities: {
    label: 'Extracurricular Impact',
    changeable: 'moderate',
    changeNote: 'New activities started now look thin, but deepening existing commitments and documenting outcomes is highly effective.',
    aggregatorKey: 'activities',
  },
  honors: {
    label: 'Honors & Recognition',
    changeable: 'limited',
    changeNote: 'Major awards take years to earn. Focus on competitions or recognitions you can pursue in the next 3-6 months.',
    aggregatorKey: 'honors',
  },
  narrative: {
    label: 'Essay & Narrative',
    changeable: 'high',
    changeNote: 'Essays are fully in your control and carry significant weight. This is where effort pays off most.',
    aggregatorKey: 'narrative',
  },
  institutionalFit: {
    label: 'Institutional Fit',
    changeable: 'high',
    changeNote: 'Fit is demonstrated through essays, activity framing, and showing genuine knowledge of the school. Highly improvable.',
    aggregatorKey: 'institutionalFit',
  },
};

/**
 * Default aggregator weights (used when school-specific weights aren't available).
 */
const DEFAULT_WEIGHTS = {
  academic: 0.30,
  activities: 0.25,
  honors: 0.10,
  narrative: 0.20,
  institutionalFit: 0.15,
};

/**
 * Get the aggregator weights for a school.
 * Maps university evaluation_weights to analyzer dimension keys.
 */
function getSchoolWeights(universityProfile) {
  const ew = universityProfile?.evaluation_weights;
  if (!ew || typeof ew !== 'object') return { ...DEFAULT_WEIGHTS };

  const gpa = parseFloat(ew.gpa) || 0.25;
  const cr = parseFloat(ew.course_rigor) || 0.20;
  const ex = parseFloat(ew.extracurriculars) || 0.15;
  const ld = parseFloat(ew.leadership) || 0.10;
  const essay = parseFloat(ew.essay) || 0.20;
  const total = gpa + cr + ex + ld + essay;

  if (total <= 0) return { ...DEFAULT_WEIGHTS };

  const coreScale = 0.88;
  const academic = ((gpa + cr) / total) * coreScale;
  const activities = ((ex + ld) / total) * coreScale;
  const narrative = (essay / total) * coreScale;
  const honors = 0.06;
  const institutionalFit = 0.06;
  const sum = academic + activities + narrative + honors + institutionalFit;

  return {
    academic: academic / sum,
    activities: activities / sum,
    honors: honors / sum,
    narrative: narrative / sum,
    institutionalFit: institutionalFit / sum,
  };
}

/**
 * Compute benchmark targets for each dimension at a school.
 * Selectivity sets a base bar; per-dimension targets scale with that school's evaluation weights.
 */
function computeTargets(universityProfile) {
  const rate = effectiveAdmitRate(universityProfile);
  const pct = rate * 100;
  const weights = getSchoolWeights(universityProfile);

  // Base targets by selectivity
  let baseTarget;
  let baseStretch;
  if (pct < 10) {
    baseTarget = 7.5;
    baseStretch = 9.0;
  } else if (pct < 20) {
    baseTarget = 6.5;
    baseStretch = 8.0;
  } else if (pct < 40) {
    baseTarget = 5.5;
    baseStretch = 7.0;
  } else {
    baseTarget = 4.5;
    baseStretch = 6.0;
  }

  // Adjust per dimension based on weight
  // Higher-weighted dimensions get higher targets (the school cares more)
  // Lower-weighted dimensions get lower targets (less scrutiny)
  const avgWeight = 0.2; // 5 dimensions, equal would be 0.2 each
  const targets = {};

  for (const [dim, meta] of Object.entries(DIMENSIONS)) {
    const w = weights[dim] || 0.2;
    // Scale factor: if weight is 2x average, target goes up ~0.8; if 0.5x, target goes down ~0.4
    const scaleFactor = (w / avgWeight - 1) * 0.8;
    const dimTarget = Math.round(Math.min(9.5, Math.max(3.0, baseTarget + scaleFactor)) * 10) / 10;
    const dimStretch = Math.round(Math.min(9.5, Math.max(4.0, baseStretch + scaleFactor)) * 10) / 10;

    targets[dim] = {
      target: dimTarget,
      stretch: dimStretch,
    };
  }

  return targets;
}

/**
 * Compute the gap map: current score, target, gap, and weighted impact for each dimension.
 */
function computeGapMap(dimensionScores, universityProfile) {
  const weights = getSchoolWeights(universityProfile);
  const targets = computeTargets(universityProfile);
  const gaps = [];

  for (const [dim, meta] of Object.entries(DIMENSIONS)) {
    const current = dimensionScores[dim] ?? 0;
    const target = targets[dim].target;
    const stretch = targets[dim].stretch;
    const gap = Math.max(0, target - current);
    const stretchGap = Math.max(0, stretch - current);
    const weight = weights[dim] || 0.1;
    const weightedImpact = gap * weight;
    const alreadyStrong = current >= target;

    gaps.push({
      dimension: dim,
      label: meta.label,
      current: Math.round(current * 10) / 10,
      target: Math.round(target * 10) / 10,
      stretch: Math.round(stretch * 10) / 10,
      gap: Math.round(gap * 10) / 10,
      stretchGap: Math.round(stretchGap * 10) / 10,
      weight: Math.round(weight * 1000) / 1000,
      weightedImpact: Math.round(weightedImpact * 100) / 100,
      changeable: meta.changeable,
      changeNote: meta.changeNote,
      alreadyStrong,
    });
  }

  // Sort by weighted impact descending (highest ROI first)
  gaps.sort((a, b) => b.weightedImpact - a.weightedImpact);

  return gaps;
}

/**
 * Compute the priority stack: which gaps to focus on, ranked by ROI.
 */
function computePriorityStack(gapMap) {
  const actionable = gapMap.filter(g => !g.alreadyStrong && g.changeable !== 'locked');
  const strengths = gapMap.filter(g => g.alreadyStrong);

  // Top priorities: high weighted impact AND changeable
  const priorities = actionable
    .map(g => ({
      ...g,
      // Boost priority for highly changeable dimensions
      adjustedImpact: g.weightedImpact * (g.changeable === 'high' ? 1.5 : g.changeable === 'moderate' ? 1.2 : 0.8),
    }))
    .sort((a, b) => b.adjustedImpact - a.adjustedImpact);

  return { priorities, strengths };
}

// ════════════════════════════════════════════════
// LAYER 2: Action Plan Generation (LLM-powered)
// ════════════════════════════════════════════════

const TIMELINE_STAGE_SET = new Set(['exploring', 'building', 'applying', 'finalizing']);

function normalizeTimelineStage(stage) {
  return TIMELINE_STAGE_SET.has(stage) ? stage : 'applying';
}

function getTimelineContext(stage) {
  switch (stage) {
    case 'exploring':
      return {
        months: '18-24+',
        focus: 'Foundation building — explore interests, start meaningful activities, build academic habits',
        canChange: 'Everything is changeable. GPA trend matters more than current GPA. Activities started now will have years of depth by application time. No need to think about essays yet.',
        actionStyle: 'long-term strategic investments',
        avoidAdvice: 'Do NOT recommend essay drafting, recommendation letter requests, or application-specific tactics. Focus on building genuine interests and experiences.',
      };
    case 'building':
      return {
        months: '12-18',
        focus: 'Deepening commitments — take leadership roles, pursue competitions, strengthen academic rigor',
        canChange: 'GPA can still move significantly. Course selection for senior year matters. Activities should deepen, not broaden. Start thinking about your narrative thread.',
        actionStyle: 'medium-term depth investments with measurable milestones',
        avoidAdvice: 'Do NOT recommend starting new clubs from scratch (not enough time for depth). Focus on rising within existing commitments and pursuing one ambitious project.',
      };
    case 'applying':
      return {
        months: '4-9',
        focus: 'Application preparation — essays, school list, recommendation letters, activity documentation',
        canChange: 'GPA is mostly locked. Course rigor is locked. Activities can be documented better but not fundamentally changed. Essays are fully in your control. Test scores may have one more attempt.',
        actionStyle: 'direct application actions with specific deadlines',
        avoidAdvice: 'Do NOT recommend starting new long-term activities. Focus on documenting impact, writing essays, and strategic positioning.',
      };
    case 'finalizing':
      return {
        months: '1-3',
        focus: 'Final polish — essay refinement, supplemental essays, interview prep',
        canChange: 'Almost everything is locked except essay quality and supplemental details. Every hour should go toward the strongest possible written application.',
        actionStyle: 'immediate high-impact actions measurable in days or weeks',
        avoidAdvice: 'Do NOT recommend anything that takes more than 2 weeks. Focus exclusively on essay quality, supplemental essays, and ensuring every word of the application is intentional.',
      };
    default:
      return getTimelineContext('applying');
  }
}

function getTimelineChangeNote(dimension, stage) {
  if (stage === 'exploring') {
    const notes = {
      academic: 'You have 2+ years to build your transcript. Every course choice and grade matters. Choose the most rigorous courses available.',
      activities: 'Start activities you genuinely care about NOW. By application time, you will have 2-3 years of depth — that is what readers want to see.',
      honors: 'Pursue competitions and awards in your areas of interest. Starting early gives you multiple attempts and builds toward national-level recognition.',
      narrative: 'No need to draft essays yet. But start journaling about experiences that shape your thinking — this raw material becomes your essay later.',
      institutionalFit: 'Begin researching schools that match your interests. Visit campuses if possible. Genuine familiarity shows in applications.',
    };
    return notes[dimension] || '';
  }
  if (stage === 'building') {
    const notes = {
      academic: 'Your GPA trend still matters. Strong junior year grades can offset a weaker freshman year. Choose your most demanding courses for senior year.',
      activities: 'Deepen your top 2-3 activities. Take leadership roles. Start one ambitious project with measurable outcomes.',
      honors: 'Target 2-3 competitions or awards this year. Quality over quantity — one regional win beats five participation certificates.',
      narrative: 'Start identifying your essay themes. What experiences have genuinely changed how you think? Begin collecting specific moments and details.',
      institutionalFit: 'Research specific programs, professors, and opportunities at target schools. This depth will show in your essays and interviews.',
    };
    return notes[dimension] || '';
  }
  return '';
}

function adjustChangeability(gapMap, stage) {
  return gapMap.map(g => {
    const adjusted = { ...g };
    if (stage === 'exploring' || stage === 'building') {
      if (adjusted.dimension === 'academic') adjusted.changeable = stage === 'exploring' ? 'high' : 'moderate';
      if (adjusted.dimension === 'honors') adjusted.changeable = 'moderate';
      adjusted.changeNote = getTimelineChangeNote(adjusted.dimension, stage);
    }
    return adjusted;
  });
}

/**
 * Build the prompt for generating the action plan.
 */
function buildActionPlanPrompt(gapMap, priorityStack, universityProfile, application, options = {}) {
  const stage = options?.timelineStage || 'applying';
  const timeline = getTimelineContext(stage);
  const schoolName = universityProfile.name || 'this institution';
  const priorities = getSchoolPriorities(universityProfile);
  const tone = universityProfile.institutional_tone || '';
  const essayImportance = universityProfile.essay_importance || 'Considered';

  const major = application?.intendedMajor || application?.academics?.intendedMajor || 'Not specified';

  const activitiesSummary = (application?.activities || []).slice(0, 5)
    .map(a => `${a.name} (${a.role}, ${a.yearsActive || 1}yr${a.isLeadership ? ', Leadership' : ''})`)
    .join('\n  ');

  const gapSummary = gapMap.map(g =>
    `${g.label}: ${g.current}/10 → target ${g.target}/10 (gap: ${g.gap}, weight: ${(g.weight * 100).toFixed(0)}%, changeable: ${g.changeable})${g.alreadyStrong ? ' ✓ ALREADY STRONG' : ''}`
  ).join('\n');

  const topPriorities = priorityStack.priorities.slice(0, 3).map(p =>
    `${p.label}: gap ${p.gap}, weighted impact ${p.weightedImpact}, changeability: ${p.changeable}`
  ).join('\n');

  const schoolPrioritiesText = priorities
    .map((p, i) => `${i + 1}. "${p.theme}" — ${p.reader_looks_for}`)
    .join('\n');

  return `You are an elite private admissions counselor who has placed 200+ students at ${schoolName}. A student has paid you $500 for a comprehensive strategy session.

Your job: create a precise, actionable plan that will maximize their chances at ${schoolName}. Every recommendation must be specific enough that the student can start TODAY. No generic advice. No "consider doing X." Tell them exactly what to do, when to do it, and how it connects to what ${schoolName} values.

=== STUDENT'S TIMELINE ===
Stage: ${stage} (${timeline.months} months before applications)
Focus at this stage: ${timeline.focus}
What can still change: ${timeline.canChange}
Action style needed: ${timeline.actionStyle}
IMPORTANT: ${timeline.avoidAdvice}

=== STUDENT'S DIMENSIONAL GAP MAP ===
${gapSummary}

=== TOP PRIORITY AREAS (ranked by impact × changeability) ===
${topPriorities}

=== ${schoolName.toUpperCase()}'S PRIORITIES ===
Essay importance: ${essayImportance}
${schoolPrioritiesText}

Reader stance: ${tone}

=== STUDENT PROFILE ===
Intended major: ${major}
Activities:
  ${activitiesSummary || 'None listed'}

=== DELIVERABLES ===

=== ACTION PLAN TIMELINE ===
Generate actions appropriate for a student who is ${timeline.months} months from application deadlines. ${timeline.avoidAdvice}

Return ONLY valid JSON (no markdown, no preamble):

{
  "strategicOverview": "<3-4 sentences. Big picture: what's the single most important thing this student needs to understand about their position relative to ${schoolName}? What's their core strength to build on, and what's the critical gap that could make or break their application? Be direct — this is a $500 session, not a pep talk.>",

  "narrativeThreadAssessment": "<2-3 sentences. Does this student's profile tell a coherent story? What IS the story right now? What SHOULD the story be for ${schoolName}? If there's a broken thread (major doesn't connect to activities, essay topic doesn't leverage strongest experiences), name it specifically.>",

  "actionPlan": [
    {
      "priority": 1,
      "dimension": "<which dimension this primarily improves>",
      "title": "<action title — imperative, specific, 5-10 words>",
      "description": "<2-3 sentences. Exactly what to do. Specific enough to start today. Reference ${schoolName}'s priorities by name.>",
      "timeline": "<specific timeframe: 'This week', 'Next 2 weeks', 'Weeks 3-4', 'Month 2', 'Month 3'>",
      "estimatedImpact": "<e.g., '+0.3 to +0.5 activity score' or 'Transforms essay from generic to Stanford-specific'>",
      "whatDoneLooksLike": "<one sentence: the measurable outcome that means this action is complete>",
      "compoundEffect": "<which OTHER dimensions this action also helps, if any — e.g., 'Also strengthens institutional fit by demonstrating school-specific knowledge'>",
      "difficultyLevel": "<'Quick win' / 'Medium effort' / 'Significant commitment'>"
    }
  ],

  "essayStrategy": {
    "primaryEssayFocus": "<What should the main essay be about? Name the specific experience/theme and why it's the strongest choice for ${schoolName}.>",
    "essayAngle": "<How should the essay frame this experience? What's the specific insight or transformation to highlight?>",
    "avoidInEssay": "<What should the student NOT write about or NOT do in their ${schoolName} essay? Reference anti-patterns.>",
    "supplementalStrategy": "<If ${schoolName} has supplemental essays, what approach? What specific aspect of the school to reference?>"
  },

  "strengthsToProtect": [
    "<dimension that's already strong + one sentence on how to maintain/leverage it>"
  ],

  "honestAssessment": "<2-3 sentences. What are the realistic odds and what should the student understand about their position? Not optimistic fluff, not crushing negativity — honest strategic guidance. If this is a reach, say so and explain what would need to be true for them to be admitted. If it's a target, explain what could go wrong.>"
}

=== HARD RULES ===
1. The actionPlan must have EXACTLY 5 actions, ordered by priority (highest impact first).
2. At least 2 actions must be "Quick win" or "Medium effort" — the student needs early momentum.
3. At least 1 action must be a compound action that improves 2+ dimensions simultaneously.
4. Every action must reference a specific ${schoolName} priority by name.
5. estimatedImpact must include a numeric score range (e.g., "+0.3 to +0.5") — not vague language.
6. essayStrategy must name a SPECIFIC experience from the student's activities to build the essay around (or, for exploring-stage students, the experience/thread to cultivate over time for a future essay).
7. Do NOT recommend starting a new club or organization if it's within 4 months of deadlines — readers see through last-minute padding.
8. Do NOT recommend things the student is already doing well — focus energy on gaps.
9. honestAssessment must name the student's admissions band (reach/target/safety) and explain why.
10. Forbidden vocabulary: comprehensive, robust, leverage, delve, journey, holistic, utilize, passionate, well-rounded.
11. Write as if the student is sitting across from you and this session determines whether they get into their dream school.
12. Honor the ACTION PLAN TIMELINE section above — actions must match ${timeline.actionStyle} and obey the IMPORTANT / avoidAdvice constraints for this stage.`;
}

// ════════════════════════════════════════════════
// LAYER 3: Post-Processing & Assembly
// ════════════════════════════════════════════════

/**
 * Post-process and validate the LLM response.
 */
function postProcessActionPlan(result, schoolName) {
  if (!result || typeof result !== 'object') return null;

  const required = ['strategicOverview', 'actionPlan', 'essayStrategy', 'honestAssessment'];
  for (const field of required) {
    if (!(field in result)) return null;
  }

  const guardText = (text) => {
    if (typeof text !== 'string') return String(text || '');
    const guarded = applyOutputGuards([text]);
    return guarded.length > 0 ? guarded[0] : text;
  };

  // Validate and clean action plan items
  const actions = Array.isArray(result.actionPlan)
    ? result.actionPlan.slice(0, 5).map((action, i) => ({
        priority: i + 1,
        dimension: guardText(action?.dimension || ''),
        title: guardText(action?.title || ''),
        description: guardText(action?.description || ''),
        timeline: guardText(action?.timeline || ''),
        estimatedImpact: guardText(action?.estimatedImpact || ''),
        whatDoneLooksLike: guardText(action?.whatDoneLooksLike || ''),
        compoundEffect: guardText(action?.compoundEffect || 'None'),
        difficultyLevel: action?.difficultyLevel || 'Medium effort',
      }))
    : [];

  return {
    school: schoolName,
    strategicOverview: guardText(result.strategicOverview || ''),
    narrativeThreadAssessment: guardText(result.narrativeThreadAssessment || ''),
    actionPlan: actions,
    essayStrategy: {
      primaryEssayFocus: guardText(result.essayStrategy?.primaryEssayFocus || ''),
      essayAngle: guardText(result.essayStrategy?.essayAngle || ''),
      avoidInEssay: guardText(result.essayStrategy?.avoidInEssay || ''),
      supplementalStrategy: guardText(result.essayStrategy?.supplementalStrategy || ''),
    },
    strengthsToProtect: Array.isArray(result.strengthsToProtect)
      ? result.strengthsToProtect.slice(0, 3).map(s => guardText(s))
      : [],
    honestAssessment: guardText(result.honestAssessment || ''),
  };
}

// ════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════

/**
 * Generate a complete gap analysis and action plan.
 *
 * @param {object} evaluationResult - The evaluation result for this school
 *   (must include dimension scores: academicStrength, activityImpact, etc.)
 * @param {object} universityProfile - Full university schema
 * @param {object} application - Student's application profile
 * @param {object} [options] - e.g. { timelineStage: 'exploring'|'building'|'applying'|'finalizing' }
 * @returns {Promise<object>} Complete gap analysis with action plan
 */
async function generateGapAnalysis(evaluationResult, universityProfile, application, options = {}) {
  if (!evaluationResult || !universityProfile) {
    return { error: 'Missing evaluation result or university profile.', school: universityProfile?.name || 'Unknown' };
  }

  const schoolName = universityProfile.name || 'Unknown';
  const timelineStage = normalizeTimelineStage(options?.timelineStage);

  // Extract dimension scores — handle both camelCase (from live eval) and snake_case (from Supabase)
  const raw = {
    academic: evaluationResult.academicStrength ?? evaluationResult.academic_strength ?? evaluationResult.academic ?? 0,
    activities: evaluationResult.activityImpact ?? evaluationResult.activity_impact ?? evaluationResult.activities ?? 0,
    honors: evaluationResult.honorsAwards ?? evaluationResult.honors_awards ?? evaluationResult.honors ?? 0,
    narrative: evaluationResult.narrativeStrength ?? evaluationResult.narrative_strength ?? evaluationResult.narrative ?? 0,
    institutionalFit: evaluationResult.institutionalFit ?? evaluationResult.institutional_fit ?? evaluationResult.fit ?? 0,
  };

  // Detect if scores are on 0-100 display scale and normalize to 0-10
  const maxScore = Math.max(...Object.values(raw));
  const dimensionScores = {};
  for (const [key, val] of Object.entries(raw)) {
    dimensionScores[key] = maxScore > 10 ? val / 10 : val;
  }

  const rawAlignment = evaluationResult.alignmentScore ?? evaluationResult.alignment_score ?? evaluationResult.alignment ?? 0;
  const alignmentScore = rawAlignment > 10 ? rawAlignment / 10 : rawAlignment;
  const band = evaluationResult.admissionsSummary?.band ?? evaluationResult.band ?? 'unknown';

  // LAYER 1: Compute gaps (pure math)
  const rawGapMap = computeGapMap(dimensionScores, universityProfile);
  const gapMap = adjustChangeability(rawGapMap, timelineStage);
  const { priorities, strengths } = computePriorityStack(gapMap);

  // LAYER 2: Generate action plan (LLM)
  const promptOptions = { ...options, timelineStage };
  const prompt = buildActionPlanPrompt(gapMap, { priorities, strengths }, universityProfile, application, promptOptions);

  let actionPlanResult = null;

  // First attempt
  let llmResult = await openaiClient.runAIAnalysis(prompt, {
    maxTokens: 3000,
    model: 'gpt-4o',
    parseMode: 'json',
  });

  if (llmResult) {
    actionPlanResult = postProcessActionPlan(llmResult, schoolName);
  }

  // Retry on failure
  if (!actionPlanResult) {
    console.warn(`[GapAnalysis] First attempt failed for ${schoolName}, retrying...`);
    llmResult = await openaiClient.runAIAnalysis(prompt, {
      maxTokens: 3000,
      model: 'gpt-4o',
      parseMode: 'json',
    });

    if (llmResult) {
      actionPlanResult = postProcessActionPlan(llmResult, schoolName);
    }
  }

  if (!actionPlanResult) {
    console.error(`[GapAnalysis] Both attempts failed for ${schoolName}`);
    return {
      error: 'Action plan generation temporarily unavailable. Please try again.',
      school: schoolName,
    };
  }

  // LAYER 3: Assemble complete gap analysis
  return {
    school: schoolName,
    alignmentScore,
    band,

    // Gap map (visual data for frontend)
    gapMap: gapMap.map(g => ({
      dimension: g.dimension,
      label: g.label,
      current: g.current,
      target: g.target,
      stretch: g.stretch,
      gap: g.gap,
      weight: g.weight,
      weightedImpact: g.weightedImpact,
      changeable: g.changeable,
      changeNote: g.changeNote,
      alreadyStrong: g.alreadyStrong,
    })),

    // Priority stack (which gaps to focus on)
    priorityStack: priorities.slice(0, 3).map(p => ({
      dimension: p.dimension,
      label: p.label,
      gap: p.gap,
      weightedImpact: p.weightedImpact,
      changeable: p.changeable,
      potentialScoreGain: Math.round(p.weightedImpact * 100) / 100,
    })),

    // Strengths to maintain
    existingStrengths: strengths.map(s => ({
      dimension: s.dimension,
      label: s.label,
      current: s.current,
    })),

    // LLM-generated strategic plan
    ...actionPlanResult,

    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  generateGapAnalysis,
  computeGapMap,
  computePriorityStack,
  getSchoolWeights,
  DIMENSIONS,
};
