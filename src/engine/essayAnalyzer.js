/**
 * School-specific essay analyzer — v2 (counselor-grade).
 *
 * Key improvements over v1:
 * 1. Recommendations include specific REWRITE suggestions, not just "improve X"
 * 2. Forced cross-referencing against application profile before claiming gaps
 * 3. "Reader memory test" — what will the admissions reader remember?
 * 4. Paragraph-level feedback, not just essay-level
 * 5. Before/after examples in recommendations
 */

const openaiClient = require('../utils/openaiClient');
const { sliceForNarrative, getSchoolPriorities } = require('./universitySlices');
const { applyOutputGuards } = require('./outputGuards');

/**
 * Build a compact summary of the student's profile for cross-referencing.
 */
function buildProfileContext(application) {
  const major = application?.intendedMajor || application?.academics?.intendedMajor || 'Not specified';
  const gpa = application?.gpa ?? application?.academics?.gpa ?? 'Not provided';
  const rigor = application?.courseRigor ?? application?.academics?.courseRigor ?? 'Not specified';

  const activities = (application?.activities || []).slice(0, 8).map(a => ({
    name: a.name || 'Unnamed',
    role: a.role || '',
    years: a.yearsActive || a.years || 0,
    isLeadership: !!a.isLeadership,
    brief: (a.description || '').slice(0, 150),
  }));

  const honors = (application?.honors || []).slice(0, 5).map(h => ({
    title: h.title || 'Unnamed',
    level: h.level || 'unknown',
  }));

  return {
    intendedMajor: major,
    gpa,
    courseRigor: rigor,
    activityCount: activities.length,
    activities,
    honorCount: honors.length,
    honors,
  };
}

/**
 * Build the analysis prompt — v2 counselor-grade.
 */
function buildEssayAnalysisPrompt(essayText, universityProfile, profileContext, essayType) {
  const priorities = getSchoolPriorities(universityProfile);
  const schoolName = universityProfile.name || 'this institution';

  const prioritiesText = priorities
    .map((p, i) => `${i + 1}. "${p.theme}" — Readers look for: ${p.reader_looks_for}`)
    .join('\n');

  const antiPatterns = (universityProfile.anti_patterns || [])
    .map((a, i) => `${i + 1}. ${a}`)
    .join('\n');

  const tone = universityProfile.institutional_tone || 'Professional, evidence-seeking.';
  const essayImportance = universityProfile.essay_importance || 'Considered';

  const profileSummary = `
Intended Major: ${profileContext.intendedMajor}
GPA: ${profileContext.gpa} | Course Rigor: ${profileContext.courseRigor}
Activities (${profileContext.activityCount}):
${profileContext.activities.map(a => `  - ${a.name} (${a.role}${a.isLeadership ? ', LEADERSHIP' : ''}, ${a.years}yr): ${a.brief}`).join('\n')}
Honors (${profileContext.honorCount}):
${profileContext.honors.map(h => `  - ${h.title} (${h.level})`).join('\n') || '  None listed'}
`.trim();

  const wordCount = essayText.split(/\s+/).filter(w => w.length > 0).length;

  return `You are a senior private admissions counselor who charges $300/hour. You have personally read 8,000+ essays and have placed students at ${schoolName}. You know what works and what doesn't — not from theory, but from watching admissions committees react to specific essays.

Your client has paid you to review their ${essayType || 'personal statement'} draft for ${schoolName}. They expect the same quality of feedback they'd get in a 60-minute session: specific, actionable, honest, and grounded in what ${schoolName} actually rewards.

=== ${schoolName.toUpperCase()}'S EVALUATION CRITERIA (these are authoritative — evaluate ONLY against these, not generic "good writing" standards) ===

Essay weight: ${essayImportance}

Ranked priorities (what ${schoolName}'s readers are trained to look for):
${prioritiesText || 'No specific priorities listed.'}

Reader stance (adopt this mindset when evaluating):
${tone}

Anti-patterns (${schoolName}'s readers flag these negatively — if the essay matches ANY, say so directly):
${antiPatterns || 'None listed.'}

=== CLIENT'S FULL APPLICATION PROFILE (CRITICAL: cross-reference before making any claim about what's "missing") ===
${profileSummary}

CROSS-REFERENCING RULE: Before you claim the essay "doesn't mention" or "lacks" something, CHECK the profile above. If the student's activities include leadership, founding, community work, or STEM engagement, do NOT claim those are absent from the application — they may simply not be in the essay, which is a different (and less severe) issue. Distinguish between "the APPLICATION lacks X" (wrong if it's in the profile) and "the ESSAY doesn't leverage X that exists in your profile" (correct and actionable).

=== ESSAY TO REVIEW ===
Type: ${essayType || 'Personal Statement'}
Word count: ${wordCount}

"""
${essayText.slice(0, 15000)}
"""

=== DELIVERABLES ===

Evaluate as a $300/hour counselor in a private session. Return ONLY valid JSON (no markdown, no preamble):

{
  "strategicFit": {
    "score": <1-10>,
    "assessment": "<2-3 sentences. Which of ${schoolName}'s specific priorities does this essay serve? Which does it miss? Name priorities by their exact theme title from the list above.>",
    "prioritiesAddressed": ["<exact priority theme names this essay touches>"],
    "prioritiesMissing": ["<exact priority theme names the essay should address but doesn't — ONLY list ones that aren't covered elsewhere in the application profile>"],
    "antiPatternsTriggered": ["<if any anti-pattern matches, quote the pattern then explain specifically how this essay triggers it>"]
  },
  "contentAnalysis": {
    "score": <1-10>,
    "strongestMoment": "<Quote the single best 5-15 word phrase from the essay. Then explain in one sentence why a ${schoolName} reader would underline this.>",
    "weakestMoment": "<Quote the single weakest 5-15 word phrase. Then explain what's wrong and suggest a specific replacement phrase the student could use instead.>",
    "specificity": "<Does the essay name real events, numbers, people, places, or outcomes? Or is it abstract? Give one example of where specificity works and one where it's missing.>",
    "redundancyCheck": "<Cross-reference with the activity list above. Does this essay tell the reader something NEW about the student — a way of thinking, a value, a turning point — that the activities list alone cannot convey? Or does it just narrate what's already listed?>",
    "depthVsBreadth": "<Does the essay go deep on one experience or skim across many? Which approach does ${schoolName} prefer based on their priorities? Is this essay calibrated correctly?>"
  },
  "structureAndVoice": {
    "score": <1-10>,
    "openingVerdict": "<Evaluate the first 1-2 sentences. A ${schoolName} reader has read 39 essays today. Does this opening make them lean forward or reach for their coffee? Be specific about why.>",
    "closingVerdict": "<Evaluate the last 2-3 sentences. Does the essay land with weight and purpose, or does it deflate? What's the last impression left with the reader?>",
    "voiceAuthenticity": "<Does this sound like a real person with real experiences, or like someone performing 'college essay voice'? Quote a specific phrase that reveals which.>",
    "pacing": "<Identify the strongest paragraph and the weakest paragraph by position (first, second, etc). Where does the essay earn its keep and where does it coast?>"
  },
  "applicationCoherence": {
    "essayConnectsToMajor": <true/false>,
    "essayConnectsToActivities": <true/false>,
    "addsNewDimension": <true/false>,
    "coherenceAssessment": "<2-3 sentences. Does this essay make the FULL application stronger as a package? What does the admissions reader now understand about this student that they couldn't learn from the activity list and transcript alone?>"
  },
  "readerMemoryTest": "<In one sentence: after reading 40 essays in a day, what single image, idea, or moment from THIS essay will the ${schoolName} reader still remember at dinner? If the answer is 'nothing specific,' say that — it's the most important feedback you can give.>",
  "topThreeRecommendations": [
    {
      "priority": "<which ${schoolName} priority this serves>",
      "current": "<quote or paraphrase the current weak passage>",
      "revised": "<write the actual improved version — not a description of what to improve, but the new sentences the student should use>",
      "why": "<one sentence: why this change matters for ${schoolName} specifically>"
    },
    {
      "priority": "<priority>",
      "current": "<current>",
      "revised": "<revised>",
      "why": "<why>"
    },
    {
      "priority": "<priority>",
      "current": "<current>",
      "revised": "<revised>",
      "why": "<why>"
    }
  ],
  "overallVerdict": "<3-4 sentences as if speaking directly to the student in a session. Where does this essay stand — ready to submit, needs one revision pass, or needs a fundamental rethink? What is the ONE thing that will most determine whether a ${schoolName} reader champions this essay in committee?>"
}

=== NON-NEGOTIABLE RULES ===
1. Every claim must reference either a specific line from the essay OR a specific priority/anti-pattern from ${schoolName}. No floating opinions.
2. strongestMoment and weakestMoment MUST quote directly from the essay text (5-15 words).
3. topThreeRecommendations must include ACTUAL REWRITTEN TEXT in the "revised" field — not "consider adding more detail" but the specific words the student should write. Write as if you are drafting the revision yourself.
4. Before listing anything in prioritiesMissing, verify it isn't already covered by the student's activities, honors, or intended major in the profile above. If it IS in the profile but NOT in the essay, frame it as "Your profile shows X but your essay doesn't leverage it" — that's actionable. "Your application lacks X" when X is in the profile is factually wrong and destroys trust.
5. readerMemoryTest must be brutally honest. If the essay is forgettable, say so. This is the most valuable sentence in the entire analysis.
6. Do NOT praise the essay for things ${schoolName} doesn't care about.
7. Do NOT manufacture weaknesses for balance. If something genuinely works, say it works.
8. Forbidden vocabulary: comprehensive, robust, leverage, delve, journey, holistic, utilize, impactful, passionate (unless quoting the student).
9. If the essay triggers an anti-pattern, name it plainly. Do not soften.
10. Write as if the student is sitting across from you and has one week before the deadline. Every word of feedback should serve that urgency.`;
}

/**
 * Post-process the LLM response: validate structure, run guards.
 */
function postProcessEssayAnalysis(result, schoolName) {
  if (!result || typeof result !== 'object') return null;

  const required = ['strategicFit', 'contentAnalysis', 'structureAndVoice',
    'applicationCoherence', 'topThreeRecommendations', 'overallVerdict'];
  for (const field of required) {
    if (!(field in result)) return null;
  }

  const guardText = (text) => {
    if (typeof text !== 'string') return text;
    const guarded = applyOutputGuards([text]);
    return guarded.length > 0 ? guarded[0] : text;
  };

  const guardArray = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, 3).map(item => {
      if (typeof item === 'string') {
        const guarded = applyOutputGuards([item]);
        return guarded.length > 0 ? guarded[0] : item;
      }
      if (typeof item === 'object' && item !== null) {
        return {
          priority: guardText(item.priority || ''),
          current: guardText(item.current || ''),
          revised: guardText(item.revised || ''),
          why: guardText(item.why || ''),
        };
      }
      return item;
    });
  };

  const clampScore = (s) => {
    const n = typeof s === 'number' ? s : parseFloat(s);
    if (isNaN(n)) return 5;
    return Math.max(1, Math.min(10, Math.round(n * 10) / 10));
  };

  return {
    school: schoolName,
    strategicFit: {
      score: clampScore(result.strategicFit?.score),
      assessment: guardText(result.strategicFit?.assessment || ''),
      prioritiesAddressed: (result.strategicFit?.prioritiesAddressed || []).slice(0, 3),
      prioritiesMissing: (result.strategicFit?.prioritiesMissing || []).slice(0, 3),
      antiPatternsTriggered: (result.strategicFit?.antiPatternsTriggered || []).slice(0, 3),
    },
    contentAnalysis: {
      score: clampScore(result.contentAnalysis?.score),
      strongestMoment: guardText(result.contentAnalysis?.strongestMoment || ''),
      weakestMoment: guardText(result.contentAnalysis?.weakestMoment || ''),
      specificity: guardText(result.contentAnalysis?.specificity || ''),
      redundancyCheck: guardText(result.contentAnalysis?.redundancyCheck || ''),
      depthVsBreadth: guardText(result.contentAnalysis?.depthVsBreadth || ''),
    },
    structureAndVoice: {
      score: clampScore(result.structureAndVoice?.score),
      openingVerdict: guardText(result.structureAndVoice?.openingVerdict || ''),
      closingVerdict: guardText(result.structureAndVoice?.closingVerdict || ''),
      voiceAuthenticity: guardText(result.structureAndVoice?.voiceAuthenticity || ''),
      pacing: guardText(result.structureAndVoice?.pacing || ''),
    },
    applicationCoherence: {
      essayConnectsToMajor: !!result.applicationCoherence?.essayConnectsToMajor,
      essayConnectsToActivities: !!result.applicationCoherence?.essayConnectsToActivities,
      addsNewDimension: !!result.applicationCoherence?.addsNewDimension,
      coherenceAssessment: guardText(result.applicationCoherence?.coherenceAssessment || ''),
    },
    readerMemoryTest: guardText(result.readerMemoryTest || ''),
    topThreeRecommendations: guardArray(result.topThreeRecommendations || []),
    overallVerdict: guardText(result.overallVerdict || ''),
  };
}

/**
 * Analyze an essay against a specific school's criteria.
 */
async function analyzeEssay(essayText, universityProfile, application, options = {}) {
  if (!essayText || typeof essayText !== 'string' || essayText.trim().length < 20) {
    return {
      error: 'Essay text is too short for meaningful analysis. Please provide at least a few sentences.',
      school: universityProfile?.name || 'Unknown',
    };
  }

  if (!universityProfile || !universityProfile.name) {
    return { error: 'University profile not found.', school: 'Unknown' };
  }

  const profileContext = buildProfileContext(application || {});
  const prompt = buildEssayAnalysisPrompt(
    essayText.trim(),
    universityProfile,
    profileContext,
    options.essayType || 'Personal Statement'
  );

  // First attempt
  let result = await openaiClient.runAIAnalysis(prompt, {
    maxTokens: 3000,
    model: 'gpt-4o',
    parseMode: 'json',
  });

  if (result) {
    const processed = postProcessEssayAnalysis(result, universityProfile.name);
    if (processed) return processed;
  }

  // Retry once
  console.warn(`[EssayAnalyzer] First attempt failed for ${universityProfile.name}, retrying...`);
  result = await openaiClient.runAIAnalysis(prompt, {
    maxTokens: 3000,
    model: 'gpt-4o',
    parseMode: 'json',
  });

  if (result) {
    const processed = postProcessEssayAnalysis(result, universityProfile.name);
    if (processed) return processed;
  }

  console.error(`[EssayAnalyzer] Both attempts failed for ${universityProfile.name}`);
  return {
    error: 'Essay analysis temporarily unavailable. Please try again in a moment.',
    school: universityProfile.name,
  };
}

module.exports = { analyzeEssay, buildProfileContext, buildEssayAnalysisPrompt };
