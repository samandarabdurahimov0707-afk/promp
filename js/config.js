/* ==========================================================================
   To'lov sozlamalari (zaxira qiymatlar).
   --------------------------------------------------------------------------
   Asosiy qiymatlar Netlify'da Environment variables orqali beriladi:
     COURSE_PRICE, PAYMENT_CARD_NUMBER, PAYMENT_CARD_HOLDER, PAYMENT_TELEGRAM,
     PAYME_MERCHANT_ID

   Bu fayldagi qiymatlar /api/config ishlamasa ishlatiladi
   (masalan, oddiy statik serverda ochganda).

   PAYME_KEY (maxfiy kalit) bu faylga hech qachon yozilmaydi.
   ========================================================================== */

window.PAYWALL_CONFIG = {
  price: 20000, // so'mda
  cardNumber: "9860012132172771",
  cardHolder: "",
  telegram: "abay_pg",
  paymeMerchantId: "",
  apiBase: "/api"
};
