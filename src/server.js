// Load .env from backend root so it works regardless of process cwd (e.g. nodemon from any directory)
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
const dotenvResult = require('dotenv').config({ path: envPath });

if (dotenvResult.error) {
  console.warn('[env] Could not load .env:', dotenvResult.error.message);
} else if (dotenvResult.parsed) {
  const hasKeyInFile = 'OPENAI_API_KEY' in dotenvResult.parsed && dotenvResult.parsed.OPENAI_API_KEY;
  if (!hasKeyInFile && process.env.USE_AI_ANALYZERS === 'true') {
    console.warn('[env] .env loaded from', envPath, 'but OPENAI_API_KEY is empty or missing. Use OPENAI_API_KEY="your-key" with quotes if the value contains special characters.');
  }
}

const app = require('./app');
const config = require('./config');
const universityDataLoader = require('./loaders/universityDataLoader');

// Temporary debug: confirm env vars are loaded (remove or guard with NODE_ENV if desired)
console.log('OPENAI_API_KEY loaded:', !!process.env.OPENAI_API_KEY);
console.log('USE_AI_ANALYZERS:', process.env.USE_AI_ANALYZERS);

// Load and validate university dataset before starting the server.
// Exits process if file is missing, JSON invalid, or schema validation fails.
universityDataLoader.init(config.dataPath);

app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
  if (config.isDevelopment) {
    console.log('Development mode: evaluation pipeline logging enabled.');
  }
  if (config.useAIAnalyzers) {
    const hasKey = typeof process.env.OPENAI_API_KEY === 'string' && process.env.OPENAI_API_KEY.trim().length > 0;
    if (hasKey) {
      console.log('AI analyzers enabled.');
    } else {
      console.log('AI analyzers enabled. Set OPENAI_API_KEY in .env to activate.');
    }
  }
});
