/**
 * AI analysis client for OpenAI-powered analyzers.
 * When config.useAIAnalyzers is true, analyzers call runAIAnalysis(prompt).
 * When OPENAI_API_KEY is missing, logs a warning and returns null so callers fall back to rule-based logic.
 */

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

let hasWarnedNoKey = false;

function getApiKey() {
  return process.env.OPENAI_API_KEY;
}

function hasValidKey() {
  const key = getApiKey();
  return typeof key === 'string' && key.trim().length > 0;
}

function warnNoKey() {
  if (!hasWarnedNoKey) {
    hasWarnedNoKey = true;
    console.warn('[openaiClient] OPENAI_API_KEY is not set. Falling back to rule-based analyzers.');
  }
}

/**
 * Normalize AI response to the shape expected by the evaluation pipeline.
 * @param {*} parsed - Parsed JSON from the model
 * @returns {{ score: number, strengths: string[], weaknesses: string[], suggestions: string[] } | null}
 */
function normalizeStructuredResult(parsed) {
  if (parsed === null || typeof parsed !== 'object') return null;
  const score = typeof parsed.score === 'number' && !Number.isNaN(parsed.score)
    ? Math.max(0, Math.min(10, parsed.score))
    : 5;
  const cap = 4;
  const strengths = Array.isArray(parsed.strengths)
    ? parsed.strengths.filter((s) => typeof s === 'string').map((s) => String(s).trim()).filter(Boolean).slice(0, cap)
    : [];
  const weaknesses = Array.isArray(parsed.weaknesses)
    ? parsed.weaknesses.filter((s) => typeof s === 'string').map((s) => String(s).trim()).filter(Boolean).slice(0, cap)
    : [];
  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions.filter((s) => typeof s === 'string').map((s) => String(s).trim()).filter(Boolean).slice(0, cap)
    : [];
  return { score, strengths, weaknesses, suggestions };
}

/**
 * Extract JSON from model content (handles raw JSON or markdown code blocks).
 * @param {string} content
 * @returns {object | null}
 */
function extractJson(content) {
  if (typeof content !== 'string' || !content.trim()) return null;
  const trimmed = content.trim();
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const toParse = codeBlockMatch ? codeBlockMatch[1].trim() : trimmed;
  try {
    return JSON.parse(toParse);
  } catch {
    return null;
  }
}

/**
 * Run an AI analysis and return a structured evaluation.
 * Uses OPENAI_API_KEY from process.env. If missing, logs a warning and returns null.
 *
 * @param {string} prompt - Full evaluation prompt (including university profile, application, and JSON output instructions)
 * @param {object} [options] - { model?: string, maxTokens?: number }
 * @returns {Promise<{ score: number, strengths: string[], weaknesses: string[], suggestions: string[] } | null>}
 */
async function runAIAnalysis(prompt, options = {}) {
  if (!hasValidKey()) {
    warnNoKey();
    return Promise.resolve(null);
  }

  const OPENAI_API_KEY = getApiKey();

  const model = options.model || 'gpt-4o-mini';
  const maxTokens = options.maxTokens ?? 1024;

  const body = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };

  let response;
  try {
    response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error('[openaiClient] Request failed:', err.message);
    return null;
  }

  if (!response.ok) {
    const errText = await response.text();
    console.error('[openaiClient] API error', response.status, errText);
    return null;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    console.error('[openaiClient] Invalid JSON response');
    return null;
  }

  const content = data.choices?.[0]?.message?.content;
  if (content == null) {
    console.error('[openaiClient] No content in response');
    return null;
  }

  const parsed = extractJson(content);
  const result = normalizeStructuredResult(parsed);
  return result;
}

module.exports = {
  runAIAnalysis,
};
