const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { requireAuth } = require('../middleware/requireAuth');

router.post('/redeem', requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.userId;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Promo code is required.' });
    }

    const trimmed = code.trim().toUpperCase();

    // Look up the code
    const { data: promo, error: lookupError } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('code', trimmed)
      .eq('active', true)
      .single();

    if (lookupError || !promo) {
      return res.status(404).json({ error: 'Invalid or expired promo code.' });
    }

    // Check expiry
    if (new Date(promo.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This promo code has expired.' });
    }

    // Check usage limit
    if (promo.current_uses >= promo.max_uses) {
      return res.status(410).json({ error: 'This promo code has reached its usage limit.' });
    }

    // Check if user already has an active subscription
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('tier, expires_at')
      .eq('user_id', userId)
      .single();

    if (existing && new Date(existing.expires_at) > new Date() && existing.tier === 'premium') {
      return res.status(409).json({ error: 'You already have Premium access.' });
    }

    // Grant the subscription
    const { error: subError } = await supabase
      .from('subscriptions')
      .upsert({
        user_id: userId,
        tier: promo.tier,
        stripe_customer_id: `PROMO_${trimmed}`,
        expires_at: promo.expires_at,
      }, { onConflict: 'user_id' });

    if (subError) {
      console.error('[Promo] Subscription upsert failed:', subError.message);
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }

    // Increment usage count
    await supabase
      .from('promo_codes')
      .update({ current_uses: promo.current_uses + 1 })
      .eq('id', promo.id);

    res.json({
      success: true,
      tier: promo.tier,
      expires_at: promo.expires_at,
      message: `Premium access activated until ${new Date(promo.expires_at).toLocaleDateString()}.`,
    });
  } catch (err) {
    console.error('[Promo] Error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
