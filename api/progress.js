import { HttpError, putUser, route, sessionUser, validProgress } from './_lib.js';

export default route('PUT', async (req, body) => {
  const { key, user } = await sessionUser(req);
  if (!validProgress(body.progress)) throw new HttpError(400, 'That save does not look right.');
  user.progress = body.progress;
  user.updatedAt = Date.now();
  await putUser(key, user);
  return [200, { ok: true, updatedAt: user.updatedAt }];
});
