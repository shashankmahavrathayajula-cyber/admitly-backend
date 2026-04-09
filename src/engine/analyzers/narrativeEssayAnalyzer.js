const config = require('../../config');
const openaiClient = require('../../utils/openaiClient');
const toneGuidance = require('../analysisToneGuidance');
const { sliceForNarrative, getSchoolPriorities } = require('../universitySlices');
const { buildEssayNarrativeExcerpt } = require('../applicationExcerpt');
const { getBenchmarks, scoreNarrative } = require('../benchmarkScoring');

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
  const benchmarks = getBenchmarks(universityProfile.name);
  const score = scoreNarrative(applicationProfile, benchmarks);
  const multiplier = benchmarks?.narrative?.essay_importance_multiplier || 1.0;

  const strengths = [];
  const weaknesses = [];
  const suggestions = [];

  if (!hasEssay) {
    weaknesses.push(
      `No essay or narrative excerpt provided; essays are ${essayImportance.toLowerCase()} at ${universityProfile.name}, which limits evaluation of "${topTheme}".`
    );
    suggestions.push(`Add ${writtenLabel} so reviewers can assess fit with priorities like "${topTheme}".`);
  } else if (score >= 7.5) {
    strengths.push(
      `Narrative content provides strong evidence for readers at ${universityProfile.name}, where essay signals are weighted with multiplier ${multiplier.toFixed(2)}.`
    );
  } else if (score >= 5.5) {
    strengths.push(
      `Essay narrative is reasonably developed for ${universityProfile.name} and gives reviewers material to assess "${topTheme}".`
    );
    suggestions.push(
      `Tighten specificity and reflection so your writing more clearly advances "${topTheme}" for ${universityProfile.name}.`
    );
  } else if (score >= 3.0) {
    weaknesses.push(
      `Narrative strength appears below the typical level expected for ${universityProfile.name}, especially for "${topTheme}".`
    );
    suggestions.push(`Provide clearer, concrete examples and reflection tied directly to "${topTheme}".`);
  } else {
    weaknesses.push(`Narrative is currently a major gap for ${universityProfile.name} given the role essays play in review.`);
    suggestions.push(`Substantially revise ${writtenLabel} with specific experiences, reflection, and school-relevant direction.`);
  }

  return {
    score: Math.max(1.0, Math.min(9.5, Math.round(score * 10) / 10)),
    strengths,
    weaknesses,
    suggestions,
  };
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
  const benchmarks = getBenchmarks(universityProfile.name);
  const benchmarkScore = scoreNarrative(applicationProfile, benchmarks);

  if (config.useAIAnalyzers) {
    const universitySlice = sliceForNarrative(universityProfile);
    const essayExcerpt = buildEssayNarrativeExcerpt(applicationProfile, 6500);
    const prompt = buildNarrativePrompt(universitySlice, essayExcerpt);

    const result = await openaiClient.runAIAnalysis(prompt, { maxTokens: 1200 });
    if (result) {
      const reinforced = reinforceQuoteRule(result, essayExcerpt);
      return {
        ...reinforced,
        score: Math.max(1.0, Math.min(9.5, Math.round(benchmarkScore * 10) / 10)),
      };
    }
  }

  return ruleBasedAnalyze(applicationProfile, universityProfile);
}

module.exports = { analyze };
