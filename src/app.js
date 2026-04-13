const express = require('express');
const cors = require('cors');
const stripeWebhook = require('./routes/stripeWebhook');
const evaluationRoutes = require('./routes/evaluationRoutes');
const essayRoutes = require('./routes/essayRoutes');
const gapRoutes = require('./routes/gapRoutes');
const schoolListRoutes = require('./routes/schoolListRoutes');
const stripeRoutes = require('./routes/stripeRoutes');
const promoRoutes = require('./routes/promoRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(
  cors({
    origin: [
      'https://admitly-insight-engine.lovable.app',
      'https://useadmitly.com',
      'http://localhost:8080',
      'http://localhost:5173',
    ],
    credentials: true,
  }),
);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Stripe webhook must use raw body (before express.json) for signature verification
app.use('/api/stripe-webhook', express.raw({ type: 'application/json' }), stripeWebhook);
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'admitly-backend' });
});

app.use('/api', evaluationRoutes);
app.use('/api', essayRoutes);
app.use('/api', gapRoutes);
app.use('/api', schoolListRoutes);
app.use('/api', stripeRoutes);
app.use('/api/promo', promoRoutes);

app.use(errorHandler);

module.exports = app;
