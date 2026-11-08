import { endSession, route, sessionUser } from './_lib.js';

export default route('POST', async (req) => {
  const { skey } = await sessionUser(req);
  await endSession(skey);
  return [200, { ok: true }];
});
