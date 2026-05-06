export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Use correct Upstash REST URL — hardcoded as fallback
  const KV_URL = process.env.KV_REST_API_URL
    || process.env.UPSTASH_REDIS_REST_URL
    || 'https://promoted-wolf-89659.upstash.io';
  const KV_TOKEN = process.env.KV_REST_API_TOKEN
    || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!KV_TOKEN) {
    return res.status(500).json({
      error: 'KV_REST_API_TOKEN not set',
      kvUrl: KV_URL,
      vars: Object.keys(process.env).filter(k => k.includes('KV') || k.includes('UPSTASH'))
    });
  }

  try {
    const config = req.body;
    if (!config || !config.role) {
      return res.status(400).json({ error: 'Invalid config' });
    }

    const id = Math.random().toString(36).substring(2, 6) +
               Math.random().toString(36).substring(2, 6);

    const response = await fetch(`${KV_URL}/set/jd:${id}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value: JSON.stringify(config), ex: 604800 })
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { data = { raw: text }; }

    if (!response.ok || data.result !== 'OK') {
      return res.status(500).json({
        error: 'Upstash error',
        status: response.status,
        response: data,
        url_used: KV_URL
      });
    }

    return res.status(200).json({ id });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
