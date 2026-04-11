const {
  matchIntendedMajorToStrengths,
  summarizeStemAndLeadershipSignals,
} = require('../majorFitHelpers');


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

  let score = 2;
  const strengths = [];
  const weaknesses = [];
  const suggestions = [];

  const intendedStr = typeof intended === 'string' ? intended.trim() : '';

  const strongStemFit =
    Boolean(matched && sig.stemCue && intendedStr && (sig.founderCue || sig.leadershipFlag || sig.yearsHigh));

  if (matched) {
    score += matchKind === 'direct' ? 3.75 : 3.45;
    if (strongStemFit) {
      score += 0.675;
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
    score += 0.75;
    suggestions.push('Name a specific department or pathway and tie it to one on-campus resource.');
  }

  if (!strongStemFit && sig.stemCue && (matched || intendedStr)) {
    score += 1.275;
    strengths.push('Activities (coding, robotics, or related STEM work) back up the stated field.');
  } else if (!strongStemFit && sig.stemCue) {
    score += 0.675;
    strengths.push('Extracurriculars show technical or STEM engagement.');
  }

  if (!strongStemFit && (sig.founderCue || sig.leadershipFlag)) {
    score += 0.975;
    strengths.push('Founding or leading a club/team adds depth beyond casual membership.');
  } else if (strongStemFit && (sig.founderCue || sig.leadershipFlag)) {
    score += 0.525;
  }

  if (sig.yearsHigh) {
    score += sig.stemCue ? 0.75 : 0.525;
  }

  if (matched && sig.stemCue && sig.founderCue && sig.yearsHigh) {
    score += 0.525;
  }

  if (!intendedStr && majorStrengths.length > 0) {
    score -= 0.75;
    weaknesses.push('Without an intended major, reviewers cannot connect your application to a clear program story.');
  }

  const cultureNotes = universityProfile.culture_notes || [];
  if (cultureNotes.length > 0) {
    score += 0.75;
  }

  score = Math.max(1.0, Math.min(9.5, Math.round(score * 10) / 10));

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

  if (tierA) score = Math.max(score, 8.5);
  else if (tierB) score = Math.max(score, 8.0);
  else if (tierC) score = Math.max(score, 7.2);

  return {
    ...result,
    score: Math.min(10, Math.round(Math.max(0, score) * 10) / 10),
  };
}

/**
 * Remove weaknesses that contradict structured application facts (major and activities in the application).
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
  const ruled = ruleBasedAnalyze(applicationProfile, universityProfile);
  const guarded = applyInstitutionalFitGuards(ruled, applicationProfile);
  return applyStrongSignalFitFloor(guarded, applicationProfile, universityProfile);
}

module.exports = { analyze };
