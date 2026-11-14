/* ==========================================================================
   To'lov sozlamalari uchun yagona manba.
   ========================================================================== */

const DEFAULT_PRICE = 20000;
const DEFAULT_CARD = "9860012132172771";
const DEFAULT_TELEGRAM = "abay_pg";

export function price() {
  const value = Number(process.env.COURSE_PRICE || 0);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : DEFAULT_PRICE;
}

export function cardNumber() {
  const value = String(process.env.PAYMENT_CARD_NUMBER || DEFAULT_CARD).replace(
    /\D/g,
    ""
  );

  return value.length >= 12 ? value : DEFAULT_CARD;
}

export function cardHolder() {
  return String(process.env.PAYMENT_CARD_HOLDER || "").trim();
}

/* Telegram manzil. Environment bo'sh bo'lsa ham saytdagi barcha
   "Telegram" havolalari kurs egasiga murojaat qiladi. */
export function telegram() {
  const value = String(process.env.PAYMENT_TELEGRAM || "").trim();
  return value || DEFAULT_TELEGRAM;
}

/* Payme merchant ID ommaviy — checkout havolasida ishlatiladi.
   Maxfiy PAYME_KEY hech qachon brauzerga chiqmaydi. */
export function paymeMerchantId() {
  return String(process.env.PAYME_MERCHANT_ID || "").trim();
}

export function paymeEnabled() {
  return paymeMerchantId().length > 0;
}
