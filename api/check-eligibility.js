export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || 'https://promoted-wolf-89659.upstash.io';
  const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!KV_URL || !KV_TOKEN) return res.status(500).json({ error: 'KV not configured' });

  const { linkId, email, fingerprint, action } = req.body || {};
  if (!linkId) return res.status(400).json({ eligible: false, reason: 'Missing link ID' });

  const GRACE_HOURS = 48; // hours before unstarted attempt expires

  try {
    // Get link config
    const configRes = await fetch(`${KV_URL}/get/jd:${linkId}`, {
      headers: { 'Authorization': `Bearer ${KV_TOKEN}` }
    });
    const configData = await configRes.json();
    if (!configData.result) {
      return res.status(200).json({ eligible: false, reason: 'expired', message: 'This interview link has expired or is no longer valid.' });
    }

    const config = JSON.parse(configData.result);
    const maxUses = parseInt(config.maxUses) || 999; // default unlimited

    // Get usage record
    const usageRes = await fetch(`${KV_URL}/get/usage:${linkId}`, {
      headers: { 'Authorization': `Bearer ${KV_TOKEN}` }
    });
    const usageData = await usageRes.json();
    let usage = { count: 0, emails: [], fingerprints: [], attempts: {} };
    try { if (usageData.result) usage = JSON.parse(usageData.result); } catch(e) {}
    if (!usage.attempts) usage.attempts = {};

    // ── ACTION: record first open (grace period tracking) ─────────────────
    if (action === 'record_open' && email) {
      const emailKey = email.toLowerCase().trim();
      if (!usage.attempts[emailKey]) {
        // First time this email opens the link
        usage.attempts[emailKey] = {
          firstOpened: new Date().toISOString(),
          started: false,
          completed: false
        };
        // Save updated usage
        await fetch(`${KV_URL}/set/usage:${linkId}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: JSON.stringify(usage), ex: 7776000 })
        });
      }
      return res.status(200).json({ ok: true });
    }

    // ── ACTION: mark as started (locks the attempt) ───────────────────────
    if (action === 'mark_started' && email) {
      const emailKey = email.toLowerCase().trim();
      if (!usage.attempts[emailKey]) usage.attempts[emailKey] = { firstOpened: new Date().toISOString() };
      usage.attempts[emailKey].started = true;
      usage.attempts[emailKey].startedAt = new Date().toISOString();
      await fetch(`${KV_URL}/set/usage:${linkId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(usage), ex: 7776000 })
      });
      return res.status(200).json({ ok: true });
    }

    // ── CHECK ELIGIBILITY ─────────────────────────────────────────────────
    // Check 1: Email already completed
    if (email && usage.emails.includes(email.toLowerCase().trim())) {
      return res.status(200).json({
        eligible: false,
        reason: 'email_used',
        message: 'You have already completed an interview for this position. Each candidate can only attempt once.'
      });
    }

    // Check 2: Email started but not completed → locked
    if (email) {
      const emailKey = email.toLowerCase().trim();
      const attempt = usage.attempts[emailKey];
      if (attempt?.started && !attempt?.completed) {
        return res.status(200).json({
          eligible: false,
          reason: 'email_used',
          message: 'You have already started this interview. Each candidate can only attempt once. Please contact taindia@tangoe.com if you believe this is an error.'
        });
      }

      // Check 3: Grace period expired (opened but never started)
      if (attempt?.firstOpened && !attempt?.started) {
        const hoursElapsed = (Date.now() - new Date(attempt.firstOpened).getTime()) / 3600000;
        if (hoursElapsed > GRACE_HOURS) {
          return res.status(200).json({
            eligible: false,
            reason: 'expired',
            message: `This interview link has expired for your email. The 48-hour window to complete your interview has passed. Please contact taindia@tangoe.com for a new link.`
          });
        }
        // Still within grace period — show time remaining
        const hoursLeft = Math.ceil(GRACE_HOURS - hoursElapsed);
        return res.status(200).json({
          eligible: true,
          graceMode: true,
          hoursLeft,
          message: `Welcome back! You have ${hoursLeft} hours remaining to complete this interview.`
        });
      }
    }

    // Check 4: Device fingerprint already used
    if (fingerprint && usage.fingerprints.includes(fingerprint)) {
      return res.status(200).json({
        eligible: false,
        reason: 'device_used',
        message: 'This device has already been used to complete an interview for this position.'
      });
    }

    // Check 5: Max uses reached (if set)
    if (maxUses !== 999 && usage.count >= maxUses) {
      return res.status(200).json({
        eligible: false,
        reason: 'max_uses',
        message: 'This interview link is no longer accepting responses.'
      });
    }

    return res.status(200).json({ eligible: true, maxUses, usedCount: usage.count });

  } catch (error) {
    return res.status(200).json({ eligible: true }); // fail open
  }
}
