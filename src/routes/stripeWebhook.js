/**
 * Stripe webhook handler.
 *
 * This is separate from stripeRoutes.js because it needs raw body parsing
 * (not JSON) for signature verification.
 *
 * Must be mounted BEFORE express.json() middleware in app.js:
 *   app.use('/api/stripe-webhook', express.raw({ type: 'application/json' }), stripeWebhook);
 */

const express = require('express');
const {
  handleCheckoutCompleted,
  constructWebhookEvent,
} = require('../services/stripeService');

const router = express.Router();

router.post('/', async (req, res) => {
  const signature = req.headers['stripe-signature'];

  if (!signature) {
    console.error('[Stripe Webhook] Missing stripe-signature header');
    return res.status(400).send('Missing stripe-signature header');
  }

  let event;
  try {
    event = constructWebhookEvent(req.body, signature);
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`[Stripe Webhook] Received event: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutCompleted(session);
        break;
      }
      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[Stripe Webhook] Processing error:', err.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
