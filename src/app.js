const express = require('express');
const cors = require('cors');
const evaluationRoutes = require('./routes/evaluationRoutes');
const essayRoutes = require('./routes/essayRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'admitly-backend' });
});

app.use('/api', evaluationRoutes);
app.use('/api', essayRoutes);

app.use(errorHandler);

module.exports = app;
