const { supabase } = require('../lib/supabase');

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.userId = user.id;
    req.userEmail = user.email || '';
    next();
  } catch (err) {
    console.error('[Auth] Verification failed:', err.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

module.exports = { requireAuth };
