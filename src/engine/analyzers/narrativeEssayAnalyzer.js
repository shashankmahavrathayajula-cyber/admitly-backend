const config = require('../../config');
const openaiClient = require('../../utils/openaiClient');
const toneGuidance = require('../analysisToneGuidance');
const { sliceForNarrative, getSchoolPriorities } = require('../universitySlices');
const { buildEssayNarrativeExcerpt } = require('../applicationExcerpt');

const JSON_FORMAT_INSTRUCTIONS = `
Return your evaluation as valid JSON only, with no other text:
{
  "score": number from 1-10,
  "strengths": ["string", ...],
  "weaknesses": ["string", ...],
  "suggestions": ["string", ...]
}`;

/** True when non-empty narrative text exists (empty essays object must not count). */
function hasEssayBodyContent(applicationProfile) {
  if (typeof applicationProfile?.essay === 'string' && applicationProfile.essay.trim()) return true;
  if (typeof applicationProfile?.personalStatement === 'string' && applicationProfile.personalStatement.trim()) {
    return true;
  }
  const essays = applicationProfile?.essays;
  if (essays && typeof essays === 'object') {
    if (typeof essays.personalStatement === 'string' && essays.personalStatement.trim()) return true;
    if (typeof essays.supplemental === 'string' && essays.supplemental.trim()) return true;
  }
  const themes = applicationProfile?.narrativeThemes ?? applicationProfile?.themes;
  const themeList = Array.isArray(themes) ? themes : [];
  return themeList.length > 0;
}

/** Word count from essay / personalStatement / essays.personalStatement / essays.supplemental only (same text sources as narrative body; themes excluded). */
function getEssayWordCount(applicationProfile) {
  const parts = [];
  if (typeof applicationProfile?.essay === 'string' && applicationProfile.essay.trim()) {
    parts.push(applicationProfile.essay.trim());
  }
  if (typeof applicationProfile?.personalStatement === 'string' && applicationProfile.personalStatement.trim()) {
    parts.push(applicationProfile.personalStatement.trim());
  }
  const essays = applicationProfile?.essays;
  if (essays && typeof essays === 'object') {
    if (typeof essays.personalStatement === 'string' && essays.personalStatement.trim()) {
      parts.push(essays.personalStatement.trim());
    }
    if (typeof essays.supplemental === 'string' && essays.supplemental.trim()) {
      parts.push(essays.supplemental.trim());
    }
  }
  const joined = parts.join(' ');
  if (!joined.trim()) return 0;
  return joined.split(/\s+/).filter(Boolean).length;
}

function ruleBasedAnalyze(applicationProfile, universityProfile) {
  const essayImportance = universityProfile.essay_importance || 'Considered';
  const priorities = getSchoolPriorities(universityProfile);
  const topTheme = priorities[0]?.theme || 'Essays and narrative';
  const isUW = universityProfile.name === 'University of Washington';
  const writtenLabel = isUW ? 'Coalition essay or personal statement' : 'personal statement or supplemental writing';

  const hasEssay = hasEssayBodyContent(applicationProfile);
  const themes = applicationProfile?.narrativeThemes ?? applicationProfile?.themes ?? [];
  const themeList = Array.isArray(themes) ? themes : [];

  let score = 5;
  const strengths = [];
  const weaknesses = [];
  const suggestions = [];

  if (hasEssay) {
    const wordCount = getEssayWordCount(applicationProfile);
    if (wordCount < 50) {
      score += 0.8;
      strengths.push(
        `Brief narrative text is present but too short for readers at ${universityProfile.name} to fully assess "${topTheme}".`
      );
      suggestions.push(
        `Expand the personal statement to give reviewers at ${universityProfile.name} enough material to evaluate "${topTheme}" — aim for 400+ words with specific examples.`
      );
    } else if (wordCount < 200) {
      score += 1.4;
      strengths.push(
        `Narrative text is present but relatively short — readers at ${universityProfile.name} will have limited material to assess "${topTheme}" against institutional priorities.`
      );
      suggestions.push(
        `Expand the personal statement to give reviewers at ${universityProfile.name} enough material to evaluate "${topTheme}" — aim for 400+ words with specific examples.`
      );
    } else {
      score += 2;
      strengths.push(
        `Narrative text is present—readers at ${universityProfile.name} can score "${topTheme}" against institutional priorities.`
      );
    }
  } else if (essayImportance === 'Very Important') {
    score -= 1.2;
    weaknesses.push(`No essay or narrative excerpt provided; written work is very important at ${universityProfile.name}, so the file is under-specified for "${topTheme}".`);
    suggestions.push(`Add ${writtenLabel} so reviewers can judge fit with institutional priorities starting with "${topTheme}".`);
  } else if (essayImportance === 'Important') {
    score -= 0.6;
    weaknesses.push(`No essay or narrative excerpt provided; written materials matter at ${universityProfile.name} for interpreting preparation and fit.`);
    suggestions.push(`Add ${writtenLabel} to give context aligned with "${topTheme}".`);
  } else {
    weaknesses.push(`No narrative excerpt on file; at ${universityProfile.name} essays are ${essayImportance.toLowerCase()}, but omitting narrative removes context for "${topTheme}".`);
    suggestions.push(`Optional: add a short ${writtenLabel} to clarify preparation or obstacles—still useful when essays are weighted lower.`);
  }

  if (themeList.length >= 1) {
    score += 1;
    strengths.push(`Declared themes give reviewers a thread (${themeList.slice(0, 3).join('; ')}).`);
  }

  score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));

  return { score, strengths, weaknesses, suggestions };
}

function buildNarrativePrompt(universitySlice, essayExcerpt) {
  const prioritiesText = (universitySlice.school_priorities || [])
    .map((p, i) => `${i + 1}. ${p.theme} — Readers look for: ${p.reader_looks_for}`)
    .join('\n');

  const antiText = (universitySlice.anti_patterns || []).map((a, i) => `${i + 1}. ${a}`).join('\n');

  const excerptIsPlaceholder = /^\[No essay or personal statement text was provided\.\]$/i.test(
    (essayExcerpt.narrative_excerpt || '').trim()
  );

  const testPolicyLine =
    universitySlice.name === 'University of Washington'
      ? 'Do NOT mention SAT or ACT as an admissions lever—UW is test-blind for first-year admission.'
      : 'Standardized tests are optional at this institution; do not center your critique on test scores.';

  const quoteRule = excerptIsPlaceholder
    ? 'Because no excerpt is present, every bullet must state what cannot be assessed and name the relevant priority theme—do not invent quotes.'
    : 'At least ONE strength must include a 4–12 word VERBATIM quote from the excerpt above inside double quotation marks (copied exactly from the student text). If you cannot find a quotable line, that strength must say exactly: Insufficient excerpt to anchor language for [name a theme].';

  return `You are an admissions reader evaluating WRITTEN APPLICATION MATERIALS for ${universitySlice.name} only.

You are not a generic writing tutor. You judge whether this narrative supports a plausible applicant **for this school’s stated priorities**.

=== INSTITUTIONAL LENS (authoritative — do not substitute other colleges’ stereotypes) ===
Essay weight in review: ${universitySlice.essay_importance || 'Unknown'}

Ranked priorities for how written work is read here:
${prioritiesText || '(Use culture_notes_compact below.)'}

Reader stance (mirror this in your judgments):
${universitySlice.institutional_tone || 'Professional, evidence-seeking.'}

Narrative-relevant trait emphasis (0–10): reflection_depth=${universitySlice.traits?.reflection_depth ?? 'n/a'}, thematic_direction=${universitySlice.traits?.thematic_direction ?? 'n/a'}, intellectual_vitality=${universitySlice.traits?.intellectual_vitality ?? 'n/a'}

Culture notes (compact):
${(universitySlice.culture_notes_compact || []).map((c, i) => `${i + 1}. ${c}`).join('\n')}

Anti-patterns at this institution (if the student matches one, name it plainly in a weakness—e.g. “reads like résumé padding”):
${antiText || '(None listed.)'}

=== STUDENT NARRATIVE EXCERPT (sole source for quotes; do not invent scenes) ===
Intended major: ${essayExcerpt.intendedMajor ?? 'not specified'}

${essayExcerpt.narrative_excerpt}

=== HARD RULES ===
1) At least ONE strength AND ONE weakness must copy a priority **theme** title verbatim from the numbered list above (exact substring).
2) ${quoteRule}
3) Every bullet must tie to the excerpt (specific paraphrase) OR to a named priority with “Insufficient text to assess [theme].” No generic praise.
4) ${testPolicyLine}
5) Forbidden vocabulary in YOUR writing (not inside student quotes): comprehensive, robust, leverage, delve, journey, holistic (unless quoting student).
6) No weak openers: "Consider", "It is important to", "Additionally", "In today's competitive".
7) Max 3 strings per list. Suggestions must each map to one named priority theme.
8) Do not use these phrases in YOUR writing: "authentic intellectual curiosity," "intellectual curiosity is evident," "aligning well with"—tie claims to lines from the excerpt instead.

${toneGuidance}
${JSON_FORMAT_INSTRUCTIONS}`;
}

/** If excerpt exists but no strength used a verbatim quote, surface the quote rule in suggestions. */
function reinforceQuoteRule(result, essayExcerpt) {
  const excerpt = (essayExcerpt?.narrative_excerpt || '').trim();
  if (!excerpt || /^\[No essay or personal statement text was provided\.\]$/i.test(excerpt)) {
    return result;
  }
  const hasQuote = (result.strengths || []).some((s) => /"[^"]{4,120}"/.test(String(s)));
  if (hasQuote) return result;
  const suggestions = [...(result.suggestions || [])].filter(Boolean);
  const line =
    'Add one strength that includes a 4–12 word verbatim quote from the excerpt above inside double quotes.';
  if (suggestions.some((s) => /verbatim quote/i.test(s))) return { ...result, suggestions: suggestions.slice(0, 3) };
  return { ...result, suggestions: [line, ...suggestions].slice(0, 3) };
}

async function analyze(applicationProfile, universityProfile) {
  if (config.useAIAnalyzers) {
    const universitySlice = sliceForNarrative(universityProfile);
    const essayExcerpt = buildEssayNarrativeExcerpt(applicationProfile, 6500);
    const prompt = buildNarrativePrompt(universitySlice, essayExcerpt);

    const result = await openaiClient.runAIAnalysis(prompt, { maxTokens: 1200 });
    if (result) return reinforceQuoteRule(result, essayExcerpt);
  }

  return ruleBasedAnalyze(applicationProfile, universityProfile);
}

module.exports = { analyze };
