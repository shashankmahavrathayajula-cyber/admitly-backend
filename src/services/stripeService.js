/**
 * Stripe integration for Admitly.
 *
 * Handles:
 * - Creating checkout sessions for Season Pass and Premium
 * - Processing webhooks for successful payments
 * - Querying user tier from Supabase
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { supabase } = require('../lib/supabase');

const PRICE_IDS = {
  season_pass: process.env.STRIPE_SEASON_PASS_PRICE_ID,
  premium: process.env.STRIPE_PREMIUM_PRICE_ID,
};

const TIER_MAP = {};
// Build reverse lookup: price_id → tier name
if (PRICE_IDS.season_pass) TIER_MAP[PRICE_IDS.season_pass] = 'season_pass';
if (PRICE_IDS.premium) TIER_MAP[PRICE_IDS.premium] = 'premium';

/**
 * Create a Stripe Checkout session.
 *
 * @param {string} userId - Supabase user ID
 * @param {string} userEmail - User's email
 * @param {string} tier - 'season_pass' or 'premium'
 * @param {string} successUrl - URL to redirect after successful payment
 * @param {string} cancelUrl - URL to redirect if payment is cancelled
 * @returns {Promise<object>} Stripe checkout session
 */
async function createCheckoutSession(userId, userEmail, tier, successUrl, cancelUrl) {
  const priceId = PRICE_IDS[tier];
  if (!priceId) {
    throw new Error(`Invalid tier: ${tier}. Must be 'season_pass' or 'premium'.`);
  }

  // Check if user already has an active subscription
  const existing = await getUserTier(userId);
  if (existing === 'season_pass' && tier === 'season_pass') {
    throw new Error('You already have a Season Pass.');
  }
  if (existing === 'premium') {
    throw new Error('You already have Premium — the highest tier.');
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: userEmail,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    metadata: {
      user_id: userId,
      tier: tier,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return session;
}

/**
 * Handle a completed checkout session (called from webhook).
 * Creates or updates the subscription record in Supabase.
 */
async function handleCheckoutCompleted(session) {
  const userId = session.metadata?.user_id;
  const tier = session.metadata?.tier;
  const customerId = session.customer;
  const sessionId = session.id;

  if (!userId || !tier) {
    console.error('[Stripe] Missing metadata in checkout session:', session.id);
    return;
  }

  // Season expiry: January 31 of next year (covers Aug-Jan season)
  const now = new Date();
  const expiryYear = now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear(); // If Aug+ → next Jan
  const expiresAt = new Date(expiryYear, 0, 31, 23, 59, 59).toISOString(); // Jan 31

  const { error } = await supabase
    .from('subscriptions')
    .upsert({
      user_id: userId,
      stripe_customer_id: customerId || null,
      stripe_session_id: sessionId,
      tier: tier,
      purchased_at: new Date().toISOString(),
      expires_at: expiresAt,
    }, { onConflict: 'user_id' });

  if (error) {
    console.error('[Stripe] Failed to save subscription:', error.message);
    throw error;
  }

  console.log(`[Stripe] Subscription saved: user=${userId}, tier=${tier}, expires=${expiresAt}`);
}

/**
 * Get the current tier for a user.
 * Returns 'free', 'season_pass', or 'premium'.
 */
async function getUserTier(userId) {
  if (!userId) return 'free';

  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('tier, expires_at')
      .eq('user_id', userId)
      .single();

    if (error || !data) return 'free';

    // Check if subscription has expired
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return 'free';
    }

    return data.tier || 'free';
  } catch {
    return 'free';
  }
}

/**
 * Construct a Stripe webhook event from the raw body and signature.
 */
function constructWebhookEvent(rawBody, signature) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  }
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

module.exports = {
  createCheckoutSession,
  handleCheckoutCompleted,
  getUserTier,
  constructWebhookEvent,
  PRICE_IDS,
};
