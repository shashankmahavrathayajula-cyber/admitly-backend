/**
 * Appended to AI analyzer prompts for shorter, less redundant model output.
 */
module.exports = `

Output constraints:
- At most 3 strings in strengths, weaknesses, and suggestions (each).
- Name concrete facts from the application (courses, clubs, essay ideas, awards, intended major).
- Write like a selective admissions officer: direct, evaluative, present tense. Do not start sentences with "You may", "You could", "Consider", or "It might".
- State judgments plainly ("The file underplays leadership depth" not "leadership could be stronger").
- Do not repeat the same idea across strengths, weaknesses, and suggestions.`;
