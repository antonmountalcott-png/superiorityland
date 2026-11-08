import { HttpError, checkCredentials, createUser, hashPassword, newRecoveryCode, newSession, normCode, publicAccount, route, validProgress } from './_lib.js';

export default route('POST', async (_req, body) => {
  const { username, password } = checkCredentials(body);
  const key = username.toLowerCase();
  const { salt, hash } = await hashPassword(password);
  const recoveryCode = newRecoveryCode();
  const rec = await hashPassword(normCode(recoveryCode));
  const now = Date.now();
  const user = { name: username, salt, hash, recSalt: rec.salt, recHash: rec.hash, createdAt: now, updatedAt: now, progress: validProgress(body.progress) ? body.progress : null };
  if (!(await createUser(key, user))) throw new HttpError(409, 'That name is taken. Try another one.');
  const token = await newSession(key);
  return [201, { token, recoveryCode, ...publicAccount(user) }];
}, 80 * 1024);
