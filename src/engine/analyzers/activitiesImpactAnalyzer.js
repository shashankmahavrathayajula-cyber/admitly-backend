const config = require('../../config');
const openaiClient = require('../../utils/openaiClient');
const toneGuidance = require('../analysisToneGuidance');
const { sliceForActivities } = require('../universitySlices');
const { buildActivitiesExcerpt } = require('../applicationExcerpt');
const { summarizeStemAndLeadershipSignals } = require('../majorFitHelpers');

const JSON_FORMAT_INSTRUCTIONS = `
Return your evaluation as valid JSON only, with no other text:
{
  "score": number from 1-10,
  "strengths": ["string", ...],
  "weaknesses": ["string", ...],
  "suggestions": ["string", ...]
}`;

function ruleBasedAnalyze(applicationProfile, universityProfile) {
  const importance = universityProfile.extracurricular_importance || 'Considered';
  const traits = universityProfile.traits || {};
  const leadershipWeight = traits.leadership ?? 6;

  const activities = applicationProfile?.activities ?? applicationProfile?.extracurriculars ?? [];
  const list = Array.isArray(activities) ? activities : [];
  const hasLeadership = Boolean(
    applicationProfile?.leadershipRoles ??
      applicationProfile?.leadership ??
      list.some(
        (a) =>
          a?.isLeadership ||
          String(a?.role || a?.type || '')
            .toLowerCase()
            .includes('lead')
      )
  );

  let score = 5;
  const strengths = [];
  const weaknesses = [];
  const suggestions = [];

  const deepSingle =
    list.length === 1 &&
    list.some((a) => {
      const desc = String(a?.description ?? a?.details ?? '').length;
      const role = String(a?.role ?? a?.title ?? a?.type ?? '').toLowerCase();
      return desc > 100 || /president|captain|founder|lead|director|officer|chair/.test(role);
    });

  if (list.length >= 3) {
    score += 2;
    strengths.push('Multiple extracurricular activities reported.');
  } else if (list.length >= 1) {
    score += deepSingle ? 1.6 : 1;
    strengths.push(
      deepSingle
        ? 'At least one activity shows depth (sustained role or detailed engagement).'
        : 'Some extracurricular involvement indicated.'
    );
  } else {
    score -= 1;
    weaknesses.push('Limited extracurricular activities listed.');
    if (importance === 'Important' || importance === 'Very Important') {
      suggestions.push('Consider adding or emphasizing impactful activities and roles.');
    }
  }

  if (hasLeadership && leadershipWeight >= 6) {
    score += 1.5;
    strengths.push('Leadership experience aligns with institutional values.');
  }

  const sig = summarizeStemAndLeadershipSignals(applicationProfile);
  if (sig.founderCue) {
    score += 0.6;
    strengths.push('Founding or launching a club/effort reads as initiative, not passive membership.');
  } else if (sig.leadershipFlag && list.length > 0) {
    score += 0.35;
  }
  if (sig.yearsHigh) {
    score += 0.45;
    strengths.push('Multi-year involvement suggests sustained commitment.');
  }

  score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));

  return { score, strengths, weaknesses, suggestions };
}

async function analyze(applicationProfile, universityProfile) {
  if (config.useAIAnalyzers) {
    const prompt = `You are an experienced university admissions officer.
Evaluate the student's extracurricular activities and their impact for the given university.

University context (priorities + EC emphasis + tone):
${JSON.stringify(sliceForActivities(universityProfile), null, 2)}

Student activities snapshot:
${JSON.stringify(buildActivitiesExcerpt(applicationProfile), null, 2)}

Judge depth, leadership, and alignment with the institutional priorities above—not generic resume praise.
${toneGuidance}
${JSON_FORMAT_INSTRUCTIONS}`;

    const result = await openaiClient.runAIAnalysis(prompt);
    if (result) return result;
  }

  return ruleBasedAnalyze(applicationProfile, universityProfile);
}

module.exports = { analyze };
