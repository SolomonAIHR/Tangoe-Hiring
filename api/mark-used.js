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

  const { linkId, email, fingerprint, candidateName } = req.body || {};
  if (!linkId) return res.status(400).json({ error: 'Missing linkId' });

  try {
    // Get current usage
    const usageRes = await fetch(`${KV_URL}/get/usage:${linkId}`, {
      headers: { 'Authorization': `Bearer ${KV_TOKEN}` }
    });
    const usageData = await usageRes.json();
    let usage = { count: 0, emails: [], fingerprints: [], completions: [] };
    try { if (usageData.result) usage = JSON.parse(usageData.result); } catch(e) {}

    // Update usage
    usage.count = (usage.count || 0) + 1;
    if (email && !usage.emails.includes(email.toLowerCase().trim())) {
      usage.emails.push(email.toLowerCase().trim());
    }
    if (fingerprint && !usage.fingerprints.includes(fingerprint)) {
      usage.fingerprints.push(fingerprint);
    }
    usage.completions = usage.completions || [];
    usage.completions.push({
      name: candidateName,
      email,
      completedAt: new Date().toISOString()
    });

    // Save updated usage — 90 day expiry
    await fetch(`${KV_URL}/set/usage:${linkId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(usage), ex: 7776000 })
    });

    return res.status(200).json({ ok: true, totalUses: usage.count });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
