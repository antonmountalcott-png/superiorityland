import { HttpError, getUser, guardFails, hashPassword, newRecoveryCode, newSession, normCode, publicAccount, putUser, route, sameHash } from './_lib.js';

export default route('POST', async (req, body) => {
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const key = username.toLowerCase();
  const guard = await guardFails(req, key, 'rec');
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 6) throw new HttpError(400, 'Passwords need at least 6 characters.');
  if (password.length > 128) throw new HttpError(400, 'That password is too long.');
  const user = await getUser(key);
  const check = await hashPassword(normCode(body.code).slice(0, 64), user?.recSalt ?? '00'.repeat(16));
  if (!user || !sameHash(check.hash, user.recHash)) {
    await guard.fail();
    throw new HttpError(401, 'That username and recovery code do not match.');
  }
  await guard.clear();
  // New password and a fresh code; the old code is used up. (Old sessions simply expire.)
  Object.assign(user, await hashPassword(password));
  const recoveryCode = newRecoveryCode();
  const rec = await hashPassword(normCode(recoveryCode));
  user.recSalt = rec.salt;
  user.recHash = rec.hash;
  await putUser(key, user);
  const token = await newSession(key);
  return [200, { token, recoveryCode, ...publicAccount(user) }];
}, 4096);
