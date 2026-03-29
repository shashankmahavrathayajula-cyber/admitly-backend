const path = require('path');

const DATA_PATH = process.env.DATA_PATH || 'data/universities.json';
const PORT = parseInt(process.env.PORT || '3001', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

const resolveDataPath = () => {
  if (path.isAbsolute(DATA_PATH)) return DATA_PATH;
  return path.join(process.cwd(), DATA_PATH);
};

// Read at access time so we always see current process.env (e.g. after dotenv loads)
function getUseAIAnalyzers() {
  return process.env.USE_AI_ANALYZERS === 'true';
}

module.exports = {
  port: PORT,
  nodeEnv: NODE_ENV,
  dataPath: resolveDataPath(),
  isDevelopment: NODE_ENV === 'development',
  get useAIAnalyzers() {
    return getUseAIAnalyzers();
  },
};
