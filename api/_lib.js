/**
 * Shared code for the account API on Vercel. Accounts live in Upstash Redis (add it from the Vercel Marketplace;
 * it sets the URL and token environment variables automatically). Files starting with _ are not routes.
 *
 * Same rules as server/server.mjs: scrypt password hashes, hashed session tokens (30 days), one-time recovery codes,
 * and rate-limited wrong guesses.
 */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const SESSION_SEC = 30 * 24 * 3600;
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const MAX_FAILS = 8;
const FAIL_SEC = 600;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(...cmd) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new HttpError(503, 'Accounts are not set up yet: add Upstash Redis to this Vercel project.');
  const r = await fetch(REDIS_URL, { method: 'POST', headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, body: JSON.stringify(cmd) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.error) throw new Error(`redis: ${body.error ?? r.status}`);
  return body.result;
}

export const getUser = async (key) => {
  const v = await redis('GET', `user:${key}`);
  return v ? JSON.parse(v) : null;
};
export const putUser = (key, u) => redis('SET', `user:${key}`, JSON.stringify(u));
/** Creates the user only if the name is free. */
export const createUser = async (key, u) => (await redis('SET', `user:${key}`, JSON.stringify(u), 'NX')) === 'OK';

const sha = (s) => createHash('sha256').update(s).digest('hex');

export async function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : randomBytes(16);
  const hash = await scrypt(String(password).normalize('NFKC'), salt, 64, { N: 16384, r: 8, p: 1 });
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}
export const sameHash = (a, b) => !!a && !!b && a.length === b.length && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));

export async function newSession(key) {
  const token = randomBytes(32).toString('base64url');
  await redis('SET', `session:${sha(token)}`, key, 'EX', SESSION_SEC);
  return token;
}

export async function sessionUser(req) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.authorization ?? '');
  if (!m) throw new HttpError(401, 'Please log in again.');
  const skey = `session:${sha(m[1])}`;
  const key = await redis('GET', skey);
  const user = key ? await getUser(key) : null;
  if (!user) throw new HttpError(401, 'Please log in again.');
  return { key, skey, user };
}
export const endSession = (skey) => redis('DEL', skey);

export function newRecoveryCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(16);
  let s = '';
  for (let i = 0; i < 16; i++) s += abc[bytes[i] % abc.length] + (i % 4 === 3 && i < 15 ? '-' : '');
  return s;
}
export const normCode = (c) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Throws if this IP has guessed wrong too often for this name; otherwise returns a recorder for a failure. */
export async function guardFails(req, key, kind) {
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown';
  const fk = `fail:${kind}:${ip}:${key}`;
  const n = Number((await redis('GET', fk)) ?? 0);
  if (n >= MAX_FAILS) throw new HttpError(429, 'Too many tries. Please wait a few minutes.');
  return {
    fail: async () => {
      await redis('INCR', fk);
      await redis('EXPIRE', fk, FAIL_SEC);
    },
    clear: () => redis('DEL', fk),
  };
}

export function checkCredentials(body) {
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!NAME_RE.test(username)) throw new HttpError(400, 'Usernames are 3 to 16 letters, numbers or underscores.');
  if (password.length < 6) throw new HttpError(400, 'Passwords need at least 6 characters.');
  if (password.length > 128) throw new HttpError(400, 'That password is too long.');
  return { username, password };
}

export const validProgress = (p) => !!p && typeof p === 'object' && !Array.isArray(p) && typeof p.xp === 'number' && Number.isFinite(p.xp) && p.xp >= 0 && p.xp <= 1e8;

export const publicAccount = (u) => ({ username: u.name, createdAt: u.createdAt, updatedAt: u.updatedAt, progress: u.progress ?? null });

/** Wraps a route: method check, JSON body, plain error messages, no caching. */
export function route(method, fn, maxBody = 64 * 1024) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (req.method !== method) throw new HttpError(405, 'Method not allowed.');
      let body = req.body ?? {};
      if (typeof body === 'string') body = body ? JSON.parse(body) : {};
      if (JSON.stringify(body).length > maxBody) throw new HttpError(413, 'That is too much data.');
      const [status, out] = await fn(req, body);
      res.status(status).json(out);
    } catch (e) {
      if (e instanceof HttpError) res.status(e.status).json({ error: e.message });
      else if (e instanceof SyntaxError) res.status(400).json({ error: 'Bad request.' });
      else {
        console.error(e);
        res.status(500).json({ error: 'Something went wrong on our side.' });
      }
    }
  };
}
