/* ==========================================================================
   Ommaviy sozlamalar (maxfiy emas).
   GET /api/config
   --------------------------------------------------------------------------
   Narx, karta raqami, Telegram manzili va Payme merchant ID.
   Maxfiy kalitlar (PAYME_KEY, ADMIN_SECRET, ACCESS_SECRET) bu yerga
   chiqmaydi — ular faqat environment variables'da turadi.
   ========================================================================== */

import {
  cardHolder,
  cardNumber,
  paymeEnabled,
  paymeMerchantId,
  price,
  telegram
} from "../lib/settings.mjs";

export async function handler() {
  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=300"
    },
    body: JSON.stringify({
      price: price(),
      cardNumber: cardNumber(),
      cardHolder: cardHolder(),
      telegram: telegram(),
      paymeMerchantId: paymeMerchantId(),
      paymeEnabled: paymeEnabled(),
      lang: "uz"
    })
  };
}
