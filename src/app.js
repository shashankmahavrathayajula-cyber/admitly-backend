const express = require('express');
const cors = require('cors');
const stripeWebhook = require('./routes/stripeWebhook');
const evaluationRoutes = require('./routes/evaluationRoutes');
const essayRoutes = require('./routes/essayRoutes');
const gapRoutes = require('./routes/gapRoutes');
const schoolListRoutes = require('./routes/schoolListRoutes');
const stripeRoutes = require('./routes/stripeRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors());
// Stripe webhook must use raw body (before express.json) for signature verification
app.use('/api/stripe-webhook', express.raw({ type: 'application/json' }), stripeWebhook);
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'admitly-backend' });
});

app.use('/api', evaluationRoutes);
app.use('/api', essayRoutes);
app.use('/api', gapRoutes);
app.use('/api', schoolListRoutes);
app.use('/api', stripeRoutes);

app.use(errorHandler);

module.exports = app;
