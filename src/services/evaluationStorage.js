const { supabase } = require('../lib/supabase');

async function saveEvaluation(userId, applicationPayload, universities, results) {
  const { data: evaluation, error: evalError } = await supabase
    .from('evaluations')
    .insert({
      user_id: userId,
      application_snapshot: applicationPayload,
      universities: universities,
    })
    .select('id')
    .single();

  if (evalError) {
    console.error('[Storage] Failed to save evaluation:', evalError);
    return null;
  }

  const resultRows = results.map(r => ({
    evaluation_id: evaluation.id,
    university_name: r.university,
    alignment_score: r.alignmentScore,
    academic_strength: r.academicStrength,
    activity_impact: r.activityImpact,
    honors_awards: r.honorsAwards,
    narrative_strength: r.narrativeStrength,
    institutional_fit: r.institutionalFit,
    core_insight: r.coreInsight || null,
    most_important_next_step: r.mostImportantNextStep || null,
    band: r.admissionsSummary?.band || null,
    band_reasoning: r.admissionsSummary?.reasoning || null,
    strengths: r.strengths || [],
    weaknesses: r.weaknesses || [],
    suggestions: r.suggestions || [],
  }));

  const { error: resultsError } = await supabase
    .from('evaluation_results')
    .insert(resultRows);

  if (resultsError) {
    console.error('[Storage] Failed to save results:', resultsError);
  }

  return evaluation.id;
}

module.exports = { saveEvaluation };
