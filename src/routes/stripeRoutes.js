/**
 * Stripe routes for Admitly.
 *
 * POST /api/checkout          - Create a checkout session
 * POST /api/stripe-webhook    - Handle Stripe webhook events
 * GET  /api/user-tier         - Get the current user's tier
 */

const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { createCheckoutSession, getUserTier } = require('../services/stripeService');

const router = express.Router();

/**
 * POST /api/checkout
 * Creates a Stripe Checkout session and returns the URL.
 *
 * Body: { tier: 'season_pass' | 'premium' }
 * Returns: { url: string }
 */
router.post('/checkout', requireAuth, async (req, res, next) => {
  const { tier } = req.body;

  if (!tier || !['season_pass', 'premium'].includes(tier)) {
    return res.status(400).json({
      error: 'Invalid tier. Must be "season_pass" or "premium".',
    });
  }

  // Hardcode allowed redirect URLs — never trust Origin/Referer headers
  const ALLOWED_ORIGINS = [
    'https://admitly-insight-engine.lovable.app',
    'https://useadmitly.com',
  ];

  const origin = req.headers.origin || '';
  const baseUrl = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : 'https://admitly-insight-engine.lovable.app';

  const successUrl = `${baseUrl}/dashboard?payment=success&tier=${tier}`;
  const cancelUrl = `${baseUrl}/dashboard?payment=cancelled`;

  try {
    const session = await createCheckoutSession(
      req.userId,
      req.userEmail || '',
      tier,
      successUrl,
      cancelUrl
    );

    res.json({ url: session.url });
  } catch (err) {
    console.error('[Stripe] Checkout error:', err.message);
    if (err.message.includes('already have')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

/**
 * GET /api/user-tier
 * Returns the current user's subscription tier.
 *
 * Returns: { tier: 'free' | 'season_pass' | 'premium', expires_at?: string }
 */
router.get('/user-tier', requireAuth, async (req, res, next) => {
  try {
    const tier = await getUserTier(req.userId);
    res.json({ tier });
  } catch (err) {
    console.error('[Stripe] Tier check error:', err.message);
    next(err);
  }
});

module.exports = router;
