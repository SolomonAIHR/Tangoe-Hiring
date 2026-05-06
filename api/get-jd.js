export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'KV store not configured' });
  }

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    const response = await fetch(`${KV_URL}/get/jd:${id}`, {
      headers: {
        'Authorization': `Bearer ${KV_TOKEN}`
      }
    });

    const data = await response.json();

    if (!data.result) {
      return res.status(404).json({ error: 'Interview link expired or not found' });
    }

    const config = JSON.parse(data.result);
    return res.status(200).json(config);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
