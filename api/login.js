import { HttpError, getUser, guardFails, hashPassword, newSession, publicAccount, route, sameHash } from './_lib.js';

export default route('POST', async (req, body) => {
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const key = username.toLowerCase();
  const guard = await guardFails(req, key, 'login');
  const user = await getUser(key);
  // Hash even for unknown names, so timing does not reveal which names exist.
  const check = await hashPassword(password.slice(0, 128), user?.salt ?? '00'.repeat(16));
  if (!user || !sameHash(check.hash, user.hash)) {
    await guard.fail();
    throw new HttpError(401, 'Wrong username or password.');
  }
  await guard.clear();
  const token = await newSession(key);
  return [200, { token, ...publicAccount(user) }];
}, 4096);
