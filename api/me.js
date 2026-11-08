import { publicAccount, route, sessionUser } from './_lib.js';

export default route('GET', async (req) => {
  const { user } = await sessionUser(req);
  return [200, publicAccount(user)];
});
