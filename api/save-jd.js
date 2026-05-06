export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'KV store not configured' });
  }

  try {
    const config = req.body;
    if (!config || !config.role) {
      return res.status(400).json({ error: 'Invalid config' });
    }

    // Generate short 8-char ID
    const id = Math.random().toString(36).substring(2, 6) + Math.random().toString(36).substring(2, 6);

    // Store in Upstash Redis with 7-day expiry (604800 seconds)
    const response = await fetch(`${KV_URL}/set/jd:${id}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        value: JSON.stringify(config),
        ex: 604800  // 7 days expiry
      })
    });

    if (!response.ok) {
      throw new Error('Failed to save to KV store');
    }

    return res.status(200).json({ id });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
