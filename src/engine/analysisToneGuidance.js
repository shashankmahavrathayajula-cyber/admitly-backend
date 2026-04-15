/**
 * Appended to AI analyzer prompts for shorter, less redundant model output.
 */
module.exports = `

Output constraints:
- At most 3 strings in strengths, weaknesses, and suggestions (each).
- Name concrete facts from the application (courses, clubs, essay ideas, awards, intended major).
- Write like a selective admissions officer: direct, evaluative, present tense. Do not start sentences with "You may", "You could", "Consider", or "It might".
- State judgments plainly ("Your application underplays leadership depth" not "leadership could be stronger").
- Do not repeat the same idea across strengths, weaknesses, and suggestions.
- Avoid filler praise: do not use "intellectual curiosity is evident," "aligning well with," "demonstrates solid academic performance," or "authentic intellectual curiosity"—say what your application actually shows.
- Prefer naming a specific club, role, course, or award over generic praise (e.g. "AP Calc and the robotics club" not "strong academic engagement").
- CONSISTENCY RULE: Your numeric score and written feedback must agree. An 8/10 means strong — do not describe it as needing major improvement. A 3/10 means weak — do not praise it as adequate. If your text contradicts your score, adjust the text to match the number, not the other way around.`;
