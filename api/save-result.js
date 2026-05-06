export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;
  if (!KV_URL || !KV_TOKEN) return res.status(500).json({ error: 'KV not configured' });

  try {
    const result = req.body;
    if (!result || !result.candidate) return res.status(400).json({ error: 'Invalid result' });

    const id = result.id || Date.now().toString();
    result.id = id;

    // Save individual result
    const r1 = await fetch(`${KV_URL}/set/result:${id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(result), ex: 7776000 })
    });
    const d1 = await r1.json();
    if (d1.result !== 'OK') throw new Error('Failed to save result: ' + JSON.stringify(d1));

    // Get and update index
    const listRes = await fetch(`${KV_URL}/get/results:index`, {
      headers: { 'Authorization': `Bearer ${KV_TOKEN}` }
    });
    const listData = await listRes.json();
    let ids = [];
    try { ids = JSON.parse(listData.result || '[]'); } catch(e) {}

    ids = [String(id), ...ids.filter(x => x !== String(id))].slice(0, 500);

    await fetch(`${KV_URL}/set/results:index`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(ids), ex: 7776000 })
    });

    return res.status(200).json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
