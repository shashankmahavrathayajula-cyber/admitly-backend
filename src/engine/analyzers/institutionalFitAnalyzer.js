const config = require('../../config');
const openaiClient = require('../../utils/openaiClient');
const toneGuidance = require('../analysisToneGuidance');
const { sliceForInstitutionalFit } = require('../universitySlices');
const { buildInstitutionalFitContext } = require('../applicationExcerpt');
const {
  matchIntendedMajorToStrengths,
  summarizeStemAndLeadershipSignals,
} = require('../majorFitHelpers');

const JSON_FORMAT_INSTRUCTIONS = `
Return your evaluation as valid JSON only, with no other text:
{
  "score": number from 1-10,
  "strengths": ["string", ...],
  "weaknesses": ["string", ...],
  "suggestions": ["string", ...]
}`;

const FIT_HARD_RULES = `
=== HARD RULES (correctness) ===
1) The JSON block "student_fit_context" includes intendedMajor and activities[]. Treat that list as authoritative for STEM/CS/leadership signals. Do NOT claim the application is silent on major, CS prep, or hands-on engagement if intendedMajor is non-empty OR activities show coding, robotics, CS clubs, founding roles, or multi-year STEM work.
2) Separate "essay/supplement thin or generic" from "no major or no preparation." If the file lists an intended major and STEM activities, weaknesses may critique essay specificity or school-tied detail—but must NOT say "no mention of major," "no intended major," or "no references to computer science" as an application-wide fact.
3) If major_strengths lists Engineering or STEM buckets and the student intends Computer Science or Software, treat that as alignment (computing sits inside those strengths unless the catalog explicitly excludes it).

=== EXPRESSION (when signals are strong) ===
4) When intended_major_vs_catalog matches AND activity_signals show stemCue plus (founderCue OR leadershipFlag OR yearsHigh), the file shows strong program alignment: fit score should usually be 7.5–9 unless weaknesses are essay-only. Strengths must sound confident and cite activities by name (from student_fit_context)—e.g. "demonstrates clear preparation for [major]" with concrete clubs/roles, not neutral hedging.
`;

function activityNamesSnippet(applicationProfile, max = 3) {
  const raw = applicationProfile?.activities ?? applicationProfile?.extracurriculars ?? [];
  const list = Array.isArray(raw) ? raw : [];
  return list
    .slice(0, max)
    .map((a) => (a?.name || a?.title || '').trim())
    .filter(Boolean)
    .join(', ');
}

function ruleBasedAnalyze(applicationProfile, universityProfile) {
  const majorStrengths = universityProfile.major_strengths || [];
  const intended =
    applicationProfile?.intendedMajor ??
    applicationProfile?.intended_major ??
    applicationProfile?.major ??
    applicationProfile?.academics?.intendedMajor ??
    '';
  const { matched, matchKind } = matchIntendedMajorToStrengths(intended, majorStrengths);
  const sig = summarizeStemAndLeadershipSignals(applicationProfile);

  let score = 5;
  const strengths = [];
  const weaknesses = [];
  const suggestions = [];

  const intendedStr = typeof intended === 'string' ? intended.trim() : '';

  const strongStemFit =
    Boolean(matched && sig.stemCue && intendedStr && (sig.founderCue || sig.leadershipFlag || sig.yearsHigh));

  if (matched) {
    score += matchKind === 'direct' ? 2.5 : 2.3;
    if (strongStemFit) {
      score += 0.45;
      const names = activityNamesSnippet(applicationProfile);
      strengths.push(
        names
          ? `Demonstrates clear preparation for ${intendedStr} (${names}): STEM involvement and sustained roles align with this institution’s strengths.`
          : `Demonstrates clear preparation for ${intendedStr}: STEM activities and sustained roles align with this institution’s strengths.`
      );
    } else {
      strengths.push(
        matchKind === 'direct'
          ? 'Intended major aligns with listed program strengths.'
          : 'Intended STEM/computing direction aligns with this institution’s engineering and STEM strengths.'
      );
    }
  } else if (intendedStr) {
    score += 0.5;
    suggestions.push('Name a specific department or pathway and tie it to one on-campus resource.');
  }

  if (!strongStemFit && sig.stemCue && (matched || intendedStr)) {
    score += 0.85;
    strengths.push('Activities (coding, robotics, or related STEM work) back up the stated field.');
  } else if (!strongStemFit && sig.stemCue) {
    score += 0.45;
    strengths.push('Extracurriculars show technical or STEM engagement.');
  }

  if (!strongStemFit && (sig.founderCue || sig.leadershipFlag)) {
    score += 0.65;
    strengths.push('Founding or leading a club/team adds depth beyond casual membership.');
  } else if (strongStemFit && (sig.founderCue || sig.leadershipFlag)) {
    score += 0.35;
  }

  if (sig.yearsHigh) {
    score += sig.stemCue ? 0.5 : 0.35;
  }

  if (matched && sig.stemCue && sig.founderCue && sig.yearsHigh) {
    score += 0.35;
  }

  if (!intendedStr && majorStrengths.length > 0) {
    score -= 0.5;
    weaknesses.push('Intended major is not specified; reviewers cannot map the file to a program story.');
  }

  const cultureNotes = universityProfile.culture_notes || [];
  if (cultureNotes.length > 0) {
    score += 0.5;
  }

  score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));

  return { score, strengths, weaknesses, suggestions };
}

/**
 * When structured signals show strong major + STEM + leadership, raise an undertuned AI fit score.
 */
function applyStrongSignalFitFloor(result, applicationProfile, universityProfile) {
  if (!result || typeof result.score !== 'number') return result;
  const intended =
    applicationProfile?.intendedMajor ??
    applicationProfile?.intended_major ??
    applicationProfile?.major ??
    applicationProfile?.academics?.intendedMajor ??
    '';
  const { matched } = matchIntendedMajorToStrengths(intended, universityProfile?.major_strengths || []);
  const sig = summarizeStemAndLeadershipSignals(applicationProfile);
  const stemMajor =
    typeof intended === 'string' &&
    /computer|computing|software|data|cyber|engineer|physics|math|statistics|stem/i.test(intended);

  let score = result.score;
  const tierA = matched && sig.stemCue && stemMajor && (sig.founderCue || sig.leadershipFlag) && sig.yearsHigh;
  const tierB = matched && sig.stemCue && stemMajor && (sig.founderCue || sig.leadershipFlag);
  const tierC = matched && sig.stemCue && stemMajor;

  if (tierA) score = Math.max(score, 8.2);
  else if (tierB) score = Math.max(score, 7.6);
  else if (tierC) score = Math.max(score, 6.8);

  return {
    ...result,
    score: Math.min(10, Math.round(Math.max(0, score) * 10) / 10),
  };
}

/**
 * Remove weaknesses that contradict structured application facts (major + activities on file).
 */
function applyInstitutionalFitGuards(result, applicationProfile) {
  if (!result || typeof result !== 'object') return result;
  const intended =
    applicationProfile?.intendedMajor ??
    applicationProfile?.intended_major ??
    applicationProfile?.major ??
    applicationProfile?.academics?.intendedMajor ??
    '';
  const intendedStr = typeof intended === 'string' ? intended.trim() : '';
  const sig = summarizeStemAndLeadershipSignals(applicationProfile);

  let weaknesses = [...(result.weaknesses || [])];

  if (intendedStr) {
    weaknesses = weaknesses.filter(
      (w) =>
        !/\bno\s+mention\s+of\s+(the\s+)?intended\s+major\b/i.test(w) &&
        !/\bno\s+mention\s+of\s+(the\s+)?intended\s+major\s+or\s+familiarity\b/i.test(w) &&
        !/\b(no|lacks)\s+(any\s+)?mention\s+of\s+(the\s+)?intended\s+major\b/i.test(w)
    );
  }

  const stemMajor = /computer|computing|software|data scien|cyber|engineer|physics|math|statistics|stem/i.test(
    intendedStr
  );

  if ((stemMajor || intendedStr) && (sig.stemCue || sig.founderCue)) {
    weaknesses = weaknesses.filter(
      (w) =>
        !/\bno\s+references?\s+to\s+.*\bcomputer\s+science\b/i.test(w) &&
        !/\bno\s+references?\s+to\s+how\s+the\s+applicant\s+plans\s+to\s+engage\b/i.test(w) &&
        !/\binsufficient\s+text\s+to\s+assess\s+.*land-grant\s+fit.*computer\s+science\b/i.test(w)
    );
  }

  if (sig.founderCue || sig.leadershipFlag) {
    weaknesses = weaknesses.filter((w) => !/\bno\s+evidence\s+of\s+sustained\s+leadership\b/i.test(w));
  }

  return { ...result, weaknesses };
}

async function analyze(applicationProfile, universityProfile) {
  const fitContext = buildInstitutionalFitContext(applicationProfile);
  const majorSignals = matchIntendedMajorToStrengths(
    fitContext.intendedMajor,
    universityProfile?.major_strengths || []
  );
  const activitySignals = summarizeStemAndLeadershipSignals(applicationProfile);

  if (config.useAIAnalyzers) {
    const prompt = `You are an experienced university admissions officer.
Evaluate institutional fit: major/program alignment, mission, and realistic engagement with what this school offers.

University context:
${JSON.stringify(sliceForInstitutionalFit(universityProfile), null, 2)}

Pre-computed signals (do not contradict):
- intended_major_vs_catalog: ${JSON.stringify(majorSignals)}
- activity_signals (coding/robotics/leadership/years): ${JSON.stringify(activitySignals)}

Student fit context (authoritative — includes activities; use this before claiming "missing" preparation):
${JSON.stringify(fitContext, null, 2)}

${FIT_HARD_RULES}
Align bullets with ranked priorities and tone; name concrete school-linked detail where the file allows it.
${toneGuidance}
${JSON_FORMAT_INSTRUCTIONS}`;

    const result = await openaiClient.runAIAnalysis(prompt);
    if (result) {
      const guarded = applyInstitutionalFitGuards(result, applicationProfile);
      return applyStrongSignalFitFloor(guarded, applicationProfile, universityProfile);
    }
  }

  const ruled = ruleBasedAnalyze(applicationProfile, universityProfile);
  return applyStrongSignalFitFloor(ruled, applicationProfile, universityProfile);
}

module.exports = { analyze };
