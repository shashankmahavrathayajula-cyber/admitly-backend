/**
 * Appended to AI analyzer prompts for shorter, less redundant model output.
 */
module.exports = `

Output constraints:
- At most 3 strings in strengths, weaknesses, and suggestions (each).
- Name concrete facts from the application (courses, clubs, essay ideas, awards, intended major).
- Avoid vague hedges ("may benefit", "could enhance", "consider exploring") unless paired with a specific action tied to their profile.
- Do not repeat the same idea across strengths, weaknesses, and suggestions.`;
