/**
 * GPT-4o discussion guide for counselor PDF (page 4).
 */

const openaiClient = require('../utils/openaiClient');

function validateQuestions(questions, _evaluations, _profile) {
  if (!Array.isArray(questions)) return [];

  return questions
    .filter((q) => {
      if (!q.question || !q.context || !q.dataPoint) return false;
      if (q.question.length < 20) return false;
      q.question = q.question.slice(0, 500);
      q.context = q.context.slice(0, 300);
      q.dataPoint = q.dataPoint.slice(0, 200);
      return true;
    })
    .slice(0, 5);
}

/**
 * @param {object[]} evaluations
 * @param {object[]} essayAnalyses
 * @param {object} profile
 * @returns {Promise<{ question: string, context: string, dataPoint: string }[]>}
 */
async function generateDiscussionGuide(evaluations, essayAnalyses, profile) {
  const prompt = `You are a veteran college admissions counselor preparing for a 15-minute meeting with a student. You have their complete evaluation data below. Generate exactly 5 discussion questions that will make this meeting productive.

=== STUDENT PROFILE ===
Name: ${profile.studentName || 'Student'}
GPA: ${profile.gpa}
Intended Major: ${profile.intendedMajor}
AP Courses: ${profile.apCoursesTaken} taken out of ${profile.apCoursesAvailable} available
${profile.satScore ? `SAT: ${profile.satScore}` : ''}
Activities: ${profile.activitiesCount} total, ${profile.leadershipRoles} leadership roles
Honors: ${profile.honorsCount} total

=== EVALUATION RESULTS ===
${evaluations
  .map(
    (e) => `${e.university} — Alignment: ${e.alignmentScore}/10 (${e.band.toUpperCase()})
  Academic: ${e.academicStrength}, Activities: ${e.activityImpact}, Honors: ${e.honorsAwards}, Narrative: ${e.narrativeStrength}, Fit: ${e.institutionalFit}
  Strengths: ${(e.strengths || []).slice(0, 3).join('; ')}
  Weaknesses: ${(e.weaknesses || []).slice(0, 3).join('; ')}`
  )
  .join('\n\n')}

${
  essayAnalyses.length > 0
    ? `=== ESSAY ANALYSES ===
${essayAnalyses
  .map(
    (ea) => `${ea.university} — Strategic Fit: ${ea.strategicFit}/10, Content: ${ea.contentAnalysis}/10, Structure: ${ea.structureAndVoice}/10
  Verdict: ${(ea.overallVerdict || '').slice(0, 200)}`
  )
  .join('\n')}`
    : ''
}

=== RULES ===
1. Each question must reference a SPECIFIC data point from above — a specific score, a specific strength/weakness, a specific school, or a specific profile detail. Do not generate generic admissions questions.
2. Questions should be things a counselor would ASK the student or DISCUSS with them — not things the counselor already knows from the data.
3. At least one question must address the student's biggest gap (lowest scoring dimension).
4. At least one question must address school-specific differences if 2+ schools are evaluated (e.g., why a dimension scores differently at different schools).
5. At least one question should explore whether the student has experiences or achievements NOT captured in their profile that could strengthen weak dimensions.
6. Do not contradict the scores. If a dimension is 8+, do not frame it as a concern. If a dimension is below 4, do not frame it as adequate.
7. Write in the voice of a counselor who has studied this student's file — direct, specific, and strategic.
8. Forbidden vocabulary: comprehensive, robust, leverage, delve, journey, holistic, utilize, passionate, well-rounded.

Return ONLY valid JSON (no markdown, no preamble):
{
  "questions": [
    {
      "question": "The specific question text the counselor should discuss",
      "context": "Why this question matters for this particular student (1-2 sentences)",
      "dataPoint": "The specific data point that triggered this question (e.g., 'Honors score: 1.5/10 at Stanford')"
    }
  ]
}`;

  try {
    const parsed = await openaiClient.runAIAnalysis(prompt, {
      model: 'gpt-4o',
      maxTokens: 1500,
      parseMode: 'json',
    });
    if (!parsed || typeof parsed !== 'object') return [];
    const raw = parsed.questions;
    if (!Array.isArray(raw)) return [];
    return validateQuestions(raw, evaluations, profile);
  } catch (err) {
    console.error('[CounselorQuestions] LLM call failed:', err.message);
    return [];
  }
}

module.exports = {
  generateDiscussionGuide,
  validateQuestions,
};
