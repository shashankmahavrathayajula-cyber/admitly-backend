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

/**
 * Drop insight lines that echo AI prompt/meta instructions (not fixable — remove entirely).
 * @param {string[]} items
 * @returns {string[]}
 */
function filterLeakedInstructions(items) {
  if (!Array.isArray(items)) return items;
  return items.filter((item) => {
    if (typeof item !== 'string' || !item.trim()) return false;
    const t = item;

    if (/from the (excerpt|passage|text) above/i.test(t)) return false;
    if (/verbatim\s+(quote|excerpt)/i.test(t)) return false;
    if (/inside\s+(double\s+quotes|quotation\s+marks)/i.test(t)) return false;
    if (/^(Add one strength|Add one weakness|Include a quote|Write a suggestion)\b/i.test(t.trim())) {
      return false;
    }
    if (/\d+\s*[\u2013-]\s*\d+\s+word/i.test(t)) return false;

    return true;
  });
}

/**
 * Phrase replacements (sanitizeOneLine) then strip leaked prompt-instruction lines.
 * @param {string[]} items
 * @returns {string[]}
 */
function applyOutputGuards(items) {
  if (!Array.isArray(items)) return items;
  const sanitized = items.map((s) => sanitizeOneLine(s));
  return filterLeakedInstructions(sanitized);
}

function sanitizeInsightArrays(result) {
  if (!result || typeof result !== 'object') return result;
  const out = { ...result };
  for (const key of ['strengths', 'weaknesses', 'suggestions']) {
    if (Array.isArray(out[key])) {
      out[key] = applyOutputGuards(out[key]);
    }
  }
  return out;
}

module.exports = {
  sanitizeOneLine,
  sanitizeInsightArrays,
  filterLeakedInstructions,
  applyOutputGuards,
};
