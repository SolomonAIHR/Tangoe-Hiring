export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const KV_URL = process.env.KV_REST_API_URL
    || process.env.UPSTASH_REDIS_REST_URL
    || 'https://promoted-wolf-89659.upstash.io';
  const KV_TOKEN = process.env.KV_REST_API_TOKEN
    || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!KV_URL || !KV_TOKEN) return res.status(500).json({ error: 'KV not configured' });

  const { linkId, email, fingerprint } = req.body || {};
  if (!linkId) return res.status(400).json({ eligible: false, reason: 'Missing link ID' });

  try {
    // Get link config
    const configRes = await fetch(`${KV_URL}/get/jd:${linkId}`, {
      headers: { 'Authorization': `Bearer ${KV_TOKEN}` }
    });
    const configData = await configRes.json();
    if (!configData.result) {
      return res.status(200).json({ eligible: false, reason: 'expired' });
    }

    const config = JSON.parse(configData.result);
    const maxUses = parseInt(config.maxUses) || 1;

    // Get usage record for this link
    const usageRes = await fetch(`${KV_URL}/get/usage:${linkId}`, {
      headers: { 'Authorization': `Bearer ${KV_TOKEN}` }
    });
    const usageData = await usageRes.json();
    let usage = { count: 0, emails: [], fingerprints: [] };
    try { if (usageData.result) usage = JSON.parse(usageData.result); } catch(e) {}

    // Check 1: Max uses reached
    if (usage.count >= maxUses && maxUses !== 999) {
      return res.status(200).json({
        eligible: false,
        reason: 'max_uses',
        message: 'This interview link is no longer accepting responses.'
      });
    }

    // Check 2: Email already used
    if (email && usage.emails.includes(email.toLowerCase().trim())) {
      return res.status(200).json({
        eligible: false,
        reason: 'email_used',
        message: 'This email address has already completed an interview for this position.'
      });
    }

    // Check 3: Device fingerprint already used
    if (fingerprint && usage.fingerprints.includes(fingerprint)) {
      return res.status(200).json({
        eligible: false,
        reason: 'device_used',
        message: 'This device has already been used to complete an interview for this position.'
      });
    }

    return res.status(200).json({ eligible: true, maxUses, usedCount: usage.count });

  } catch (error) {
    // On error — allow through (fail open, don't block candidates)
    return res.status(200).json({ eligible: true });
  }
}
