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

  try {
    let result = req.body;
    if (!result || !result.candidate) return res.status(400).json({ error: 'Invalid result' });

    const id = result.id || Date.now().toString();
    result.id = id;

    // ✅ Strip base64 photo data — keep only count to reduce payload size
    // Photos are large base64 strings that can exceed Upstash 1MB free limit
    const photoCount = (result.photos || []).length;
    const cleanResult = {
      ...result,
      photos: Array(photoCount).fill({ dataUrl: null, time: null }) // preserve count, drop data
    };

    const payload = JSON.stringify(cleanResult);
    const payloadSizeKB = Math.round(Buffer.byteLength(payload, 'utf8') / 1024);

    // If still too large, strip transcript too and keep summary
    let finalPayload = payload;
    if (payloadSizeKB > 900) {
      const minResult = {
        ...cleanResult,
        transcript: (cleanResult.transcript || []).map(t => ({
          q: t.q,
          a: t.a ? t.a.substring(0, 500) : '',
          flags: t.flags || []
        }))
      };
      finalPayload = JSON.stringify(minResult);
    }

    // Save individual result
    const r1 = await fetch(`${KV_URL}/set/result:${id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: finalPayload, ex: 7776000 })
    });
    const d1 = await r1.json();
    if (d1.result !== 'OK') {
      return res.status(500).json({
        error: 'Upstash save failed',
        detail: d1,
        payloadKB: payloadSizeKB
      });
    }

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

    return res.status(200).json({ ok: true, id, payloadKB: payloadSizeKB });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
