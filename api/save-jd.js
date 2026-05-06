export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'KV not configured' });
  }

  try {
    const config = req.body;
    if (!config || !config.role) {
      return res.status(400).json({ error: 'Invalid config' });
    }

    // Generate short 8-char ID
    const id = Math.random().toString(36).substring(2, 6) +
               Math.random().toString(36).substring(2, 6);

    // Upstash REST API — POST to /pipeline for set with expiry
    const response = await fetch(`${KV_URL}/pipeline`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([
        ['SET', `jd:${id}`, JSON.stringify(config), 'EX', 604800]
      ])
    });

    const data = await response.json();

    // Pipeline returns array of results
    if (!Array.isArray(data) || data[0]?.result !== 'OK') {
      // Try simple SET as fallback
      const r2 = await fetch(`${KV_URL}/set/jd:${id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${KV_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ value: JSON.stringify(config), ex: 604800 })
      });
      const d2 = await r2.json();
      if (d2.result !== 'OK') throw new Error('KV set failed: ' + JSON.stringify(d2));
    }

    return res.status(200).json({ id });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
