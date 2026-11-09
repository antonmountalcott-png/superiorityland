import { redisConfigured } from './_lib.js';

export default function handler(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const ready = redisConfigured;
  res.status(200).json({ ok: true, accounts: ready });
}
