/* ==========================================================================
   Mehmon (brauzer uid) ma'lumotlarini yangi hisobga ko'chirish.
   --------------------------------------------------------------------------
   Ro'yxatdan o'tishdan oldin to'lagan foydalanuvchi hisobini yo'qotmasligi
   uchun entitlement, buyurtmalar va Payme tranzaksiyalari hisob ID siga
   o'tkaziladi.
   ========================================================================== */

import { list, read, remove, write } from "./store.mjs";
import { validUserId } from "./users.mjs";

const ENTITLEMENT_PREFIX = "entitlements/";
const ORDER_PREFIX = "orders/";
const ORDER_INDEX_PREFIX = "order-by-uid/";
const TX_PREFIX = "payme/";

export async function mergeGuest(guestUid, userId) {
  const guest = String(guestUid || "").trim();

  if (!validUserId(guest) || !validUserId(userId) || guest === userId) {
    return { merged: false, paid: false };
  }

  let merged = false;
  const entitlement = await read(ENTITLEMENT_PREFIX + guest);
  let current = await read(ENTITLEMENT_PREFIX + userId);

  if (!current && entitlement) {
    current = Object.assign({}, entitlement, { uid: userId });
    await write(ENTITLEMENT_PREFIX + userId, current);
    merged = true;
  }

  /*
   * Mehmon identifikatori bo'yicha kirish huquqi hisobga ko'chirilgandan
   * keyin o'chiriladi. Aks holda tizimdan chiqqan foydalanuvchi eski
   * brauzer uid'i orqali pullik darslarni ochishda davom etardi.
   */
  if (current) {
    await remove(ENTITLEMENT_PREFIX + guest);
  }

  const results = await Promise.all([list(ORDER_PREFIX), list(TX_PREFIX)]);
  let pendingCode = "";

  for (const order of results[0]) {
    if (!order || order.uid !== guest) continue;

    await write(
      ORDER_PREFIX + order.code,
      Object.assign({}, order, { uid: userId })
    );
    merged = true;

    if (order.status === "pending" && !pendingCode) {
      pendingCode = order.code;
    }
  }

  for (const tx of results[1]) {
    if (tx && tx.uid === guest) {
      await write(TX_PREFIX + tx.id, Object.assign({}, tx, { uid: userId }));
      merged = true;
    }
  }

  if (pendingCode) {
    const existingCode = await read(ORDER_INDEX_PREFIX + userId);
    const existing = existingCode
      ? await read(ORDER_PREFIX + existingCode)
      : null;

    if (!existing || existing.status !== "pending") {
      await write(ORDER_INDEX_PREFIX + userId, pendingCode);
    }
  }

  await remove(ORDER_INDEX_PREFIX + guest);

  return { merged: merged, paid: Boolean(current) };
}
