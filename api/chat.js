// Rate limiting store (in-memory, resets on cold start)
const rateLimitStore = new Map();

function getRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour window
  const maxRequests = 25; // max 25 interview questions per IP per hour

  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  const record = rateLimitStore.get(ip);

  // Reset window if expired
  if (now > record.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  record.count++;
  if (record.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }

  return { allowed: true, remaining: maxRequests - record.count };
}

export default async function handler(req, res) {
  // CORS — only allow your Vercel domain + localhost for testing
  const allowedOrigins = [
    'https://tangoe-screening.vercel.app',
    'https://project-r9tqw.vercel.app', // legacy fallback
    'https://tangoe-screening.vercel.app',
    'https://project-r9tqw-git-main-rufus-solomons-projects.vercel.app',
    'http://localhost:3000',
    'http://localhost:5000'
  ];

  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  const isAllowed = allowedOrigins.some(o => origin.startsWith(o) || referer.startsWith(o));

  // Allow if origin matches OR no origin (server-to-server)
  if (origin && !isAllowed) {
    return res.status(403).json({ error: { message: 'Unauthorized origin' } });
  }

  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, anthropic-version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });

  // Rate limiting by IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';

  const rateCheck = getRateLimit(ip);
  res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);

  if (!rateCheck.allowed) {
    const resetMins = Math.ceil((rateCheck.resetAt - Date.now()) / 60000);
    return res.status(429).json({
      error: { message: `Rate limit exceeded. Try again in ${resetMins} minutes.` }
    });
  }

  // Validate request body
  const body = req.body;
  if (!body || !body.messages || !Array.isArray(body.messages)) {
    return res.status(400).json({ error: { message: 'Invalid request body' } });
  }

  // Block excessive token requests
  if (body.max_tokens && body.max_tokens > 1000) {
    body.max_tokens = 1000;
  }

  // Only allow specific models
  const allowedModels = ['claude-haiku-4-5-20251001', 'claude-haiku-3-5-20241022', 'claude-sonnet-4-20250514'];
  if (body.model && !allowedModels.includes(body.model)) {
    body.model = 'claude-haiku-4-5-20251001';
  }

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: { message: 'API key not configured on server' } });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (error) {
    return res.status(500).json({ error: { message: error.message } });
  }
}
