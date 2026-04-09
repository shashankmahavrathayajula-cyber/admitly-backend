const crypto = require('crypto');
const { supabase } = require('../lib/supabase');

/**
 * Hash the application payload into a deterministic string.
 * Strips fields that don't affect evaluation (like timestamps).
 */
function hashPayload(application) {
  const normalized = JSON.stringify({
    gpa: application.gpa ?? application.academics?.gpa,
    courseRigor: application.courseRigor ?? application.academics?.courseRigor,
    intendedMajor: application.intendedMajor ?? application.academics?.intendedMajor,
    apCoursesTaken: application.apCoursesTaken ?? application.academics?.apCoursesTaken,
    apCoursesAvailable: application.apCoursesAvailable ?? application.academics?.apCoursesAvailable,
    tests: application.tests ?? application.academics?.tests,
    activities: (application.activities || []).map(a => ({
      name: a.name,
      role: a.role,
      description: a.description,
      yearsActive: a.yearsActive,
      isLeadership: a.isLeadership,
    })),
    honors: (application.honors || []).map(h => ({
      title: h.title,
      level: h.level,
    })),
    essay: application.essays?.personalStatement || application.personalStatement || application.essay || '',
  });
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Look up a cached evaluation result.
 * Returns the result object if found and not expired, null otherwise.
 */
async function getCached(payloadHash, universityName) {
  try {
    const { data, error } = await supabase
      .from('evaluation_cache')
      .select('result')
      .eq('payload_hash', payloadHash)
      .eq('university_name', universityName)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) return null;
    return data.result;
  } catch {
    return null;
  }
}

/**
 * Store an evaluation result in the cache.
 * TTL: 24 hours.
 */
async function setCache(payloadHash, universityName, result) {
  try {
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('evaluation_cache')
      .upsert({
        payload_hash: payloadHash,
        university_name: universityName,
        result: result,
        expires_at: expires,
      }, { onConflict: 'payload_hash,university_name' });
    if (error) {
      console.error('[Cache] Failed to write cache:', error.message);
    }
  } catch (err) {
    console.error('[Cache] Failed to write cache:', err.message);
  }
}

module.exports = { hashPayload, getCached, setCache };
