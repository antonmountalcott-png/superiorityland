export default function handler(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const ready = !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
  res.status(200).json({ ok: true, accounts: ready });
}
