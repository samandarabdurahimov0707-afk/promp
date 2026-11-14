/* ==========================================================================
   Joriy sessiya va hisobni aniqlash.
   ========================================================================== */

import { parseCookies, verifySession } from "./access.mjs";
import { findById, publicUser } from "./users.mjs";
import { read } from "./store.mjs";

export async function currentUser(event) {
  const headers = (event && event.headers) || {};
  const cookies = parseCookies(headers.cookie || headers.Cookie || "");
  const uid = verifySession(cookies.pk_session);

  if (!uid) return null;

  return findById(uid);
}

export async function currentAccount(event) {
  const user = await currentUser(event);

  if (!user) return { user: null, paid: false };

  const entitlement = await read("entitlements/" + user.id);

  return { user: publicUser(user), paid: Boolean(entitlement) };
}
