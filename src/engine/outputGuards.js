/**
 * Lightweight anti-slop: strip weak openers and cliché fragments from insight strings.
 */

const BANNED_LINE_PREFIXES = [
  /^Consider\s+/i,
  /^It is important to\s+/i,
  /^It'?s important to\s+/i,
  /^In today'?s competitive\s+/i,
  /^In an increasingly competitive\s+/i,
  /^You may want to\s+/i,
  /^You might want to\s+/i,
  /^One should\s+/i,
  /^Students should\s+/i,
  /^Additionally,?\s+/i,
];

const BANNED_SUBSTRINGS = [
  ' may want to ',
  ' might want to ',
  ' it is worth noting that ',
  ' plays an important role in today\'s ',
];

/** Replace generic evaluator clichés with tighter wording (keeps sentences grammatical). */
const PHRASE_REPLACEMENTS = [
  [/\bintellectual\s+curiosity\s+is\s+evident\b/gi, 'Specific interests show in courses and activities'],
  [/\bintellectual\s+curiosity\b/gi, 'stated interests'],
  [/\bdemonstrates?\s+solid\s+academic\s+performance\b/gi, 'shows strong grades'],
  [/\baligning\s+well\s+with\b/gi, 'consistent with'],
  [/\balign(?:s|ed|ing)?\s+well\s+with\b/gi, 'consistent with'],
  [/\bindicative\s+of\s+academic\s+excellence\b/gi, 'consistent with strong grades'],
  [/\bconvey\s+depth\s+to\s+stand\s+out\b/gi, 'add concrete outcomes and specifics'],
  [/\bauthentic\s+intellectual\s+curiosity\b/gi, 'specific curiosity in coursework'],
  [/\bwell[-\s]?aligned\s+with\b/gi, 'consistent with'],
  [/\bshows?\s+strong\s+alignment\s+with\b/gi, 'matches'],
];

function sanitizeOneLine(text) {
  if (typeof text !== 'string') return text;
  let t = text.trim();
  for (const re of BANNED_LINE_PREFIXES) {
    t = t.replace(re, '').trim();
  }
  for (const sub of BANNED_SUBSTRINGS) {
    const idx = t.toLowerCase().indexOf(sub);
    if (idx !== -1) {
      t = (t.slice(0, idx) + t.slice(idx + sub.length)).replace(/\s+/g, ' ').trim();
    }
  }
  for (const [re, rep] of PHRASE_REPLACEMENTS) {
    t = t.replace(re, rep);
  }
  if (t.length < 8 && text.trim().length > 8) return text.trim();
  return t;
}

function sanitizeInsightArrays(result) {
  if (!result || typeof result !== 'object') return result;
  const out = { ...result };
  for (const key of ['strengths', 'weaknesses', 'suggestions']) {
    if (Array.isArray(out[key])) {
      out[key] = out[key].map((s) => sanitizeOneLine(s));
    }
  }
  return out;
}

module.exports = {
  sanitizeOneLine,
  sanitizeInsightArrays,
};
