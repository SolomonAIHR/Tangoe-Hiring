export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const KV_URL = process.env.KV_REST_API_URL
    || process.env.UPSTASH_REDIS_REST_URL
    || 'https://promoted-wolf-89659.upstash.io';
  const KV_TOKEN = process.env.KV_REST_API_TOKEN
    || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!KV_URL || !KV_TOKEN) return res.status(500).json({ error: 'KV not configured' });

  try {
    // Get index of all result IDs
    const listRes = await fetch(`${KV_URL}/get/results:index`, {
      headers: { 'Authorization': `Bearer ${KV_TOKEN}` }
    });
    const listData = await listRes.json();
    let ids = [];
    try { ids = JSON.parse(listData.result || '[]'); } catch(e) {}

    if (!ids.length) return res.status(200).json({ results: [] });

    // Fetch all results in parallel (max 50 at a time)
    const fetchIds = ids.slice(0, 50);
    const fetches = fetchIds.map(id =>
      fetch(`${KV_URL}/get/result:${id}`, {
        headers: { 'Authorization': `Bearer ${KV_TOKEN}` }
      }).then(r => r.json()).then(d => {
        try { return JSON.parse(d.result); } catch(e) { return null; }
      }).catch(() => null)
    );

    const results = (await Promise.all(fetches)).filter(Boolean);
    return res.status(200).json({ results });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
