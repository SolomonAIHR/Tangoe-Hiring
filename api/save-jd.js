export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || 'https://promoted-wolf-89659.upstash.io';
  const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!KV_URL || !KV_TOKEN) return res.status(500).json({ error: 'KV not configured' });

  const body = req.body || {};

  // ── DEACTIVATE / REACTIVATE ──────────────────────────────────────────────
  if (body.action === 'deactivate' || body.action === 'reactivate') {
    const { shortId, action } = body;
    if (!shortId) return res.status(400).json({ error: 'Missing shortId' });
    try {
      const r = await fetch(`${KV_URL}/get/jd:${shortId}`, {
        headers: { 'Authorization': `Bearer ${KV_TOKEN}` }
      });
      const d = await r.json();
      if (!d.result) return res.status(404).json({ error: 'Link not found' });
      const config = JSON.parse(d.result);
      config.active = action === 'reactivate';
      await fetch(`${KV_URL}/set/jd:${shortId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(config), ex: 7776000 })
      });
      return res.status(200).json({ ok: true, active: config.active });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── SAVE NEW JD ──────────────────────────────────────────────────────────
  try {
    const { role, req: reqNum, jd, questions, focus, level, camera,
            pasteDetect, tabDetect, photoInterval, maxUses, expiryDays, expiresAt } = body;

    if (!jd) return res.status(400).json({ error: 'Missing JD content' });

    const finalRole = (role && role.trim()) ? role.trim() : 'Screening Interview';
    const id = Math.random().toString(36).substring(2, 10);

    const config = {
      role: finalRole,
      req: reqNum || '',
      jd,
      questions: parseInt(questions) || 6,
      focus: focus || 'balanced',
      level: level || 'mid',
      camera: camera !== false,
      pasteDetect: pasteDetect !== false,
      tabDetect: tabDetect !== false,
      photoInterval: parseInt(photoInterval) || 60,
      maxUses: parseInt(maxUses) || 999,
      expiryDays: parseInt(expiryDays) || 0,
      expiresAt: expiresAt || null,
      active: true,
      shortId: id,
      savedAt: new Date().toISOString()
    };

    // Save config to Upstash
    const r = await fetch(`${KV_URL}/set/jd:${id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(config), ex: 7776000 })
    });
    const d = await r.json();
    if (d.result !== 'OK') return res.status(500).json({ error: 'Failed to save to Upstash', detail: d });

    // Add to index
    const idxRes = await fetch(`${KV_URL}/get/jd:index`, {
      headers: { 'Authorization': `Bearer ${KV_TOKEN}` }
    });
    const idxData = await idxRes.json();
    let ids = [];
    try { ids = JSON.parse(idxData.result || '[]'); } catch(e) {}
    ids = [id, ...ids.filter(x => x !== id)].slice(0, 200);
    await fetch(`${KV_URL}/set/jd:index`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(ids), ex: 7776000 })
    });

    return res.status(200).json({ id, role: finalRole });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
