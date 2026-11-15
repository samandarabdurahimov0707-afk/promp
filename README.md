# Prompt injenering kursi

Netlify'ga joylash uchun tayyor **video kurs sayti**. Navbar'da
**«Prompt injenering kursi»** yozuvi turadi, sayt faqat video darslardan
iborat. Har bir `<video>` tegi avtomatik bitta kartochka yaratadi va
hisoblagichni oshiradi.

- **Kirish darsi va 1–3-darslar bepul.**
- **4-darsdan boshlab** darslar bir martalik **20 000 so'm** evaziga ochiladi.
- Asosiy to'lov usuli — **Payme**: to'lov va kirish huquqi **avtomatik**
  tasdiqlanadi.
- Zaxira usul — **karta o'tkazmasi**: buyurtma kodi orqali admin panelda
  qo'lda tasdiqlanadi.
- **20 000 so'm** to'lovi karta **`9860012132172771`** hisobiga yo'naltiriladi
  (Payme Business'dagi hisob-kitob kartasi sifatida sozlanadi).

## Asosiy imkoniyatlar

| Bo'lim | Nima bor |
|---|---|
| Landing | Hero, ishonch bloki, kurs natijalari, auditoriya, narx, FAQ, CTA |
| Katalog | Qidiruv, filtr (barchasi/bepul/pullik/tugallanmagan), progress |
| Pleer | Modal oynada `<video>` / YouTube / Bunny Stream |
| Hisob | Email + parol bilan ro'yxatdan o'tish/kirish; qurilmalar orasida kirish |
| To'lov | Payme checkout + karta o'tkazmasi (kod bilan) |
| Admin | Statistika, qidiruv/filtr, CSV eksport, ochish/bekor qilish/qayta ochish, email orqali ruxsat, avto-yangilash |
| PWA | `manifest.webmanifest`, service worker, offline sahifa, ikonkalar |
| SEO | meta/OG/Twitter, JSON-LD, `robots.txt`, `sitemap.xml`, canonical |
| Huquqiy | `shartlar.html`, `maxfiylik.html`, `404.html` |
| Xavfsizlik | CSP, HSTS, X-Frame-Options, fail-closed kalitlar, rate limit |

## Tuzilma

```
prompt-kursi/
├─ index.html                  # landing + videolar ro'yxati (asosiy tahrir fayli)
├─ admin.html                  # kurs egasi paneli (login + dashboard)
├─ shartlar.html               # foydalanish shartlari
├─ maxfiylik.html              # maxfiylik siyosati
├─ offline.html                # PWA offline sahifasi
├─ 404.html                    # xato sahifasi
├─ css/
│  ├─ style.css                # sayt dizayni (design system)
│  └─ admin.css                # admin panel dizayni
├─ js/
│  ├─ config.js                # zaxira sozlamalar (narx, karta)
│  ├─ common.js                # nav, yil, /api/config, Telegram, PWA
│  ├─ app.js                   # darslar, filtr, progress, hisob, paywall, Payme
│  └─ admin.js                 # admin login, statistika, CSV, amallar
├─ img/                        # ikonkalar, OG rasm, poster SVG'lar
├─ videos/                     # lokal mp4/webm fayllar
├─ netlify/
│  ├─ functions/
│  │  ├─ config.mjs            # GET  /api/config  — ommaviy sozlamalar
│  │  ├─ health.mjs            # GET  /api/health  — holat tekshiruvi
│  │  ├─ order.mjs             # POST /api/order   — karta buyurtmasi
│  │  ├─ access.mjs            # GET  /api/access  — kirish huquqi + cookie
│  │  ├─ auth.mjs              # POST /api/auth    — hisob: kirish/ro'yxat/chiqish
│  │  ├─ admin.mjs             # POST /api/admin   — admin amallari
│  │  ├─ payme.mjs             # POST /api/payme   — Payme Merchant API
│  │  └─ bunny-token.mjs       # GET  /api/bunny-token — imzolangan video
│  └─ lib/                     # store, access, auth, users, merge, rate, settings
├─ scripts/
│  ├─ serve.mjs                # lokal dev server (statik + /api/*)
│  └─ check.mjs                # sintaksis/JSON/majburiy fayl tekshiruvi
├─ tests/functions.test.mjs    # backend testlari (node:test)
├─ manifest.webmanifest
├─ sw.js
├─ robots.txt
├─ sitemap.xml
├─ netlify.toml
├─ package.json
├─ .nvmrc
└─ .env.example
```

## Tez boshlash (lokal)

Talab: **Node.js 20+** (`.nvmrc` da `20`).

```bash
npm install
cp .env.example .env
# .env ichidagi ADMIN_SECRET va ACCESS_SECRET ni to'ldiring
npm run dev
```

Dev server: <http://127.0.0.1:8123>. U statik fayllarni va `/api/*`
funksiyalarini birga ishlatadi, video uchun `Range` so'rovlarini qo'llab
quvvatlaydi. `.env` fayli bo'lsa, o'zgaruvchilar shundan o'qiladi.

> **Muhim:** `ACCESS_SECRET` bo'lmasa ro'yxatdan o'tish «Hisob tizimi
> hozircha sozlanmagan» xatosi bilan to'xtaydi. Kalitlarni `.env` ga
> yozgandan keyin dev serverni **qayta ishga tushiring** — u `.env` ni
> faqat ishga tushishda o'qiydi.

Kalit yaratish (PowerShell):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Faqat dizaynni ko'rish uchun istalgan statik server ham bo'ladi, lekin
to'lov va admin funksiyalari ishlamaydi.

### Tekshiruv va testlar

```bash
npm run check   # JS sintaksisi, JSON, majburiy fayllar, CSP inline tekshiruvi
npm test        # backend: config, health, order, access, admin, Payme, Bunny
npm run verify  # ikkalasi ketma-ket
```

Testlar Netlify Blobs bo'lmaganda xotiradagi store'dan foydalanadi —
internet yoki tashqi xizmat kerak emas.

## Videolarni qanday qo'shish

Barcha videolar `index.html` oxiridagi `<div id="video-tags">` ichida turadi.
Har bir `<video>` tegi — bitta kartochka:

```html
<video preload="none"
       src="videos/01-dars.mp4"
       poster="img/poster-ai.svg"
       data-title="1-dars. Prompt injeneringga kirish"
       data-description="Prompt nima va AI bilan muloqot qanday ishlaydi."
       data-duration="12:40"></video>
```

Tegni nusxa ko'chirib, ro'yxat oxiriga qo'shsangiz — yangi kartochka paydo
bo'ladi va yuqoridagi hisoblagich avtomatik oshadi. Qo'lda sanash shart emas.

| Atribut | Ma'nosi |
|---|---|
| `src` | lokal video yo'li, masalan `videos/01-dars.mp4` |
| `poster` | muqova rasmi (ixtiyoriy) |
| `data-title` | dars nomi (majburiy); dars raqami shu yerdan olinadi |
| `data-description` | qisqa tavsif (ixtiyoriy) |
| `data-duration` | davomiylik, masalan `12:40` (ixtiyoriy) |
| `data-youtube` | YouTube havolasi yoki video ID (`src` o'rniga) |
| `data-bunny` | Bunny Stream video ID (himoyalangan hosting) |
| `data-paid` | `"true"` — dars pullik |
| `data-free` | `"true"` — dars bepul (`data-paid-from` ni bekor qiladi) |

### Qaysi darslar pullik?

`<div id="video-tags" data-paid-from="4">` — **4-darsdan boshlab** barcha
darslar avtomatik pullik. Raqam `data-title` boshidagi `"4-dars..."` dan
olinadi. Bitta darsni bepul qilish uchun `data-free="true"` qo'shing.

### Bir nechta format

```html
<video data-title="1-dars. Kirish">
  <source src="videos/01-dars.mp4"  type="video/mp4">
  <source src="videos/01-dars.webm" type="video/webm">
</video>
```

Brauzer mos formatni o'zi tanlaydi.

### YouTube

```html
<video data-youtube="https://youtu.be/VIDEO_ID"
       data-title="1-dars. Kirish"></video>
```

Faqat ID ham bo'ladi: `data-youtube="dQw4w9WgXcQ"`. Muqova YouTube'dan
avtomatik olinadi. Video egasi tashqi saytda ko'rsatishga ruxsat bergan
bo'lishi kerak.

### Video hali tayyor bo'lmasa

`src` bo'sh bo'lsa, karta **«Tez kunda»** holatida turadi va bosilmaydi.

## To'lov qanday ishlaydi

### Payme — avtomatik (asosiy)

1. Foydalanuvchi pullik darsni bosadi → to'lov oynasi ochiladi.
2. **«Payme orqali to'lash»** tugmasi checkout'ga o'tadi (20 000 so'm,
   foydalanuvchi `uid` si bilan).
3. Payme serveri `https://SAYTINGIZ.netlify.app/api/payme` manziliga
   JSON-RPC webhook yuboradi.
4. `payme.mjs` autentifikatsiya, summa va hisobni tekshiradi; to'lov
   yakunlanganda kirish huquqini **avtomatik** beradi.
5. Foydalanuvchi `?payme=1` bilan saytga qaytadi — darslar allaqachon ochiq.

Payme Merchant API to'liq qo'llab-quvvatlanadi: `CheckPerformTransaction`,
`CreateTransaction`, `PerformTransaction`, `CancelTransaction`,
`CheckTransaction`, `GetStatement`. Tranzaksiyalar idempotent, 12 soatlik
timeout va bekor qilishda huquqni olib tashlash mavjud.

### Karta o'tkazmasi — zaxira (qo'lda)

1. Foydalanuvchi **«Karta orqali o'tkazma»** bo'limini ochadi → sayt unga
   shaxsiy kod beradi (masalan `K7M2QP`).
2. Kartaga **20 000 so'm** o'tkazadi va izohda kodni yozadi.
3. Kurs egasi `admin.html` da kodni tasdiqlaydi.
4. Foydalanuvchi sahifasi holatni davriy tekshiradi — darslar ochiladi.

Pullik darslar uchun **hisob majburiy**: 4-darsdan boshlab sayt avval
kirish/ro'yxatdan o'tish oynasini ko'rsatadi, keyin to'lov oynasini ochadi.
Bepul darslar hisobsiz ham ochiq.

Kirish huquqi hisob identifikatoriga bog'lanadi va HMAC-SHA256 bilan
imzolangan `HttpOnly`, `SameSite=Lax` cookie'lar bilan mustahkamlanadi:

- `pk_session` — 30 kunlik sessiya (parol scrypt bilan xeshlanadi);
- `pk_access` — 1 yillik kirish huquqi cookie'si.

Mehmon sifatida to'lov qilgan foydalanuvchi ro'yxatdan o'tsa yoki tizimga
kirsa, to'lov avtomatik hisobiga ko'chadi. Chiqishda ikkala cookie ham
o'chiriladi.

## Sozlash

### 1. Netlify environment variables

**Site configuration → Environment variables**:

| O'zgaruvchi | Majburiy | Ma'nosi |
|---|---|---|
| `COURSE_PRICE` | ha | Narx **so'mda** (`20000`); Payme'ga tiyinda (×100) yuboriladi |
| `PAYME_MERCHANT_ID` | Payme uchun | Payme Business merchant ID (ommaviy) |
| `PAYME_KEY` | Payme uchun | Payme Business maxfiy kaliti (≥8 belgi) |
| `PAYMENT_CARD_NUMBER` | zaxira usul | Karta raqami (`9860012132172771`) |
| `PAYMENT_CARD_HOLDER` | yo'q | Karta egasining ismi |
| `PAYMENT_TELEGRAM` | yo'q | Telegram username yoki havola (standart: `abay_pg`) |
| `ADMIN_SECRET` | ha | Kamida **8 belgi**li maxfiy satr (admin panel) |
| `ACCESS_SECRET` | ha | Kamida **16 belgi**li satr; bo'lmasa huquq berilmaydi |
| `BUNNY_LIBRARY_ID` | yo'q | Bunny Stream kutubxonasi |
| `BUNNY_TOKEN_KEY` | yo'q | Bunny Stream token kaliti |

Maxfiy satr yaratish (PowerShell):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **Muhim:** Netlify'da o'zgaruvchi qo'shgandan yoki o'zgartirgandan keyin
> **Deploys → Trigger deploy → Clear cache and deploy site** qiling. Aks
> holda eski muhit bilan ishlaydigan funksiyalar qoladi va ro'yxatdan
> o'tish «Hisob tizimi sozlanmagan» xatosini berishda davom etadi.

### 2. Payme Business'ni ulash

1. [payme.uz](https://payme.uz) da **Payme Business** hisobini oching.
2. Kabinetdan **merchant ID** va **maxfiy kalit**ni oling →
   `PAYME_MERCHANT_ID`, `PAYME_KEY`.
3. **Hisob-kitob (payout) kartasi** sifatida `9860012132172771` ni kiriting —
   pul shu kartaga tushadi.
4. **Webhook manzili:** `https://SAYTINGIZ.netlify.app/api/payme`.
5. Tekshiruv: `/api/health` `ok` qaytarishi kerak.

> **Muhim:** Payme checkout to'lovni to'g'ridan-to'g'ri ixtiyoriy kartaga emas,
> **merchant hisobiga** qabul qiladi. `9860012132172771` ga pul Payme
> Business kabinetidagi hisob-kitob kartasi orqali tushadi — shuning uchun
> 3-qadam majburiy.

### 3. `js/config.js` (zaxira)

`/api/config` ishlamasa (masalan, oddiy statik serverda ochganda) sayt shu
fayldagi qiymatlarni ishlatadi:

```js
window.PAYWALL_CONFIG = {
  price: 20000, // so'mda
  cardNumber: "9860012132172771",
  cardHolder: "",
  telegram: "abay_pg",
  paymeMerchantId: "",
  apiBase: "/api"
};
```

Maxfiy kalitlarni (`PAYME_KEY`, `ADMIN_SECRET`, `ACCESS_SECRET`) bu faylga
**hech qachon yozmang** — ular faqat serverda turadi.

## Admin panel

Manzil: `https://SAYTINGIZ.netlify.app/admin.html` (yoki `/admin`).

1. `ADMIN_SECRET` ni kiriting — kalit faqat shu brauzer sessiyasida saqlanadi.
2. **Statistika**: jami buyurtma, kutilayotgan, to'langan, tushum, oxirgi
   30 kun, foydalanuvchilar soni.
3. **Buyurtmalar jadvali**: karta va Payme yozuvlari birlashtirilgan;
   kod, ism, email yoki foydalanuvchi ID bo'yicha qidiruv va holat filtri.
4. **CSV eksport**: joriy filtr bo'yicha yuklab olish.
5. **Kod orqali ochish**: karta o'tkazmasi izohidagi 6 belgili kodni
   tasdiqlaydi. Xato bilan bekor qilingan buyurtmani **«Qayta ochish»**
   tugmasi bilan tiklash mumkin.
6. **Email orqali ochish**: buyurtma kodi yo'qolgan yoki to'lov kod
   yozilmasdan qilingan holatda ro'yxatdan o'tgan hisobga ruxsat beradi.
   To'langan buyurtma mavjud bo'lsa, email ruxsatini bekor qilish bloklanadi —
   avval buyurtma kodini bekor qilish kerak.
7. **Avto-yangilash**: har 30 soniyada (o'chirish mumkin).

Payme yozuvlari panelda faqat o'qish uchun — ularni bekor qilish Payme
kabineti orqali amalga oshiriladi. Kanallar orasi himoya ishlaydi: bitta
kanal bekor qilinsa, foydalanuvchida boshqa faol to'lov bo'lsa, kirish
huquqi saqlanadi.

Tasdiqlashdan keyin foydalanuvchi sahifasi har 5 soniyada `/api/access` ni
tekshiradi; qo'shimcha **«Tekshirish»** tugmasi ham bor. Shu sababli karta
o'tkazmasi tasdiqlangach darslar sahifani yangilamasdan ochiladi.

Sahifa menyuda ko'rinmaydi, `noindex` va `X-Robots-Tag` bilan yopilgan.

## PWA, SEO va huquqiy sahifalar

### Domenni almashtirish

`SAYTINGIZ.netlify.app` o'rniga o'z domeningizni yozing:

- `index.html` — `canonical`, `og:url`, `og:image`, `twitter:image`, JSON-LD;
- `shartlar.html`, `maxfiylik.html` — `canonical`;
- `robots.txt` — `Sitemap:`;
- `sitemap.xml` — barcha `<loc>` manzillari.

### PWA

`manifest.webmanifest`, `sw.js`, `img/icon-*.png`, `offline.html` tayyor.
Service worker HTML'ni network-first, CSS/JS/rasmni cache-first rejimida
keshlaydi; `/api/*` va `/videos/*` hech qachon keshlanmaydi. Ikonkalarni
almashtirsangiz, `manifest.webmanifest` dagi yo'llarni yangilang.

### Huquqiy matnlar

`shartlar.html` va `maxfiylik.html` neytral **«Kurs egasi»** iborasi bilan
yozilgan. Telegram havolalari `data-telegram` orqali `/api/config` dan
to'ldiriladi — `PAYMENT_TELEGRAM` bo'sh bo'lsa, havola yashirin qoladi.
Yakuniy matnni o'z faoliyatingizga moslashtiring; zarur bo'lsa yuridik
maslahat oling.

## Deploy

```bash
npm install
npx netlify deploy --prod
```

Yoki GitHub'ga yuklab, Netlify'da **Import an existing project** qiling:

- **Build command:** bo'sh
- **Publish directory:** `.`
- **Functions directory:** `netlify/functions` (`netlify.toml` belgilaydi)
- **Node version:** `20` (`netlify.toml` + `.nvmrc`)

> **Fayl hajmi:** GitHub bitta faylga **100 MB** limit qo'yadi. `videos/`
> ichidagi har bir fayl 100 MB dan kichik bo'lishi shart. Kattaroq videoni
> siqish yoki YouTube/Bunny Stream'ga ko'chirish kerak.

> **Muhim:** server funksiyalari ishlashi uchun sayt **GitHub yoki Netlify
> CLI** orqali joylanishi kerak — oddiy drag & drop funksiyalarni joylamaydi.
> `.env` faylini hech qachon GitHub'ga yubormang, u `.gitignore` da.

Deploydan keyin:

1. `https://SAYTINGIZ.netlify.app/api/health` → `{ "ok": true }`.
2. `https://SAYTINGIZ.netlify.app/api/config` → narx va karta raqami.
3. Admin panelda test buyurtma yaratib, ochish/bekor qilishni tekshiring.
4. Payme kabinetida webhook manzilini va test to'lovni tasdiqlang.

## Xavfsizlik

- `PAYME_KEY`, `ADMIN_SECRET`, `ACCESS_SECRET` faqat serverda tekshiriladi va
  brauzerga chiqmaydi.
- Payme webhook'i `Basic base64("Paycom:" + PAYME_KEY)` bilan vaqt-bardosh
  (timing-safe) taqqoslanadi; kalit bo'lmasa endpoint ishlamaydi.
- Payme summasi har so'rovda tiyinda qayta tekshiriladi; tranzaksiyalar
  idempotent.
- `ACCESS_SECRET` bo'lmasa yoki 16 belgidan qisqa bo'lsa, kirish huquqi
  **umuman berilmaydi** (fail closed).
- Kirish huquqi HMAC-SHA256 imzolangan `HttpOnly`, `SameSite=Lax` cookie
  orqali beriladi. Imzo aynan 64 hex belgi ekani tekshiriladi.
- Parollar `scrypt` (64 bayt, tasodifiy salt) bilan xeshlanadi; ochiq parol
  saqlanmaydi. Email indeksi SHA-256 bilan yashiriladi.
- Sessiya `session:<user-id>` prefiksi bilan alohida imzolanadi — `pk_access`
  tokenini sessiya sifatida ishlatib bo'lmaydi.
- Tizimdan chiqishda `pk_session` va `pk_access` ikkalasi ham o'chiriladi.
- Admin so'rovlari `ADMIN_SECRET` bilan himoyalangan; IP bo'yicha daqiqasiga
  30 ta urinish.
- Buyurtma endpointi IP bo'yicha daqiqasiga 15 ta, auth endpointi 20 ta
  so'rov bilan cheklangan.
- Auth javobi email mavjudligini vaqt bo'yicha oshkor qilmaydi (mavjud
  bo'lmagan email uchun ham scrypt hisoblanadi).
- `netlify.toml` CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy` va `Permissions-Policy` header'larini o'rnatadi.
- Admin sahifada inline `<script>`/`<style>` yo'q — CSP bilan mos.
- Foydalanuvchi `uid` si brauzerda tasodifiy UUID sifatida yaratiladi.
- Buyurtma kodlari 6 belgili, tasodifiy va takrorlanmaydigan.

### Muhim cheklov: video fayllar himoyasi

To'lov devori faqat **sayt orqali** ko'rishni cheklaydi. `videos/` papkasidagi
mp4 fayllar to'g'ridan-to'g'ri havola orqali ochilishi mumkin, chunki ular
statik fayllar. To'liq himoya uchun:

1. Videolarni **Bunny Stream** ga yuklang.
2. Har bir tegda `data-bunny="VIDEO_ID"` ishlating.
3. `BUNNY_LIBRARY_ID` va `BUNNY_TOKEN_KEY` ni environment variables ga qo'shing.

Shunda sayt faqat to'lagan foydalanuvchiga qisqa muddatli imzolangan havola
beradi (`/api/bunny-token`).

## Netlify cheklovlari

- Bitta statik fayl hajmi **100 MB** dan oshmasligi kerak. Katta videolar
  uchun Bunny Stream yoki YouTube ishlating.
- Funksiyalar serverless — IP rate limit har bir instansiya xotirasida ishlaydi;
  katta yuklamada qo'shimcha himoya (masalan, Netlify WAF) tavsiya etiladi.
- Netlify Blobs production'da `NETLIFY_BLOBS_CONTEXT` bilan ishlaydi. Agar bu
  o'zgaruvchi funksiyalarga berilmasa, `SITE_ID` va `NETLIFY_BLOBS_TOKEN`
  (Netlify personal access token) qo'shiladi — kod ular bilan qo'lda sozlanadi.
  Lokalda xotira ishlatiladi.

## Muammolarni bartaraf etish

| Alomat | Tekshiring |
|---|---|
| Payme tugmasi ko'rinmaydi | `PAYME_MERCHANT_ID` to'ldirilganmi (`/api/config`) |
| Payme `-32504` qaytaradi | `PAYME_KEY` va `Basic` header to'g'riligi |
| To'lovdan keyin darslar ochilmadi | `/api/health`, Payme webhook manzili, Blobs ishlashi |
| `/api/health` da `"blobs": false` | `NETLIFY_BLOBS_TOKEN` va `SITE_ID` mavjudmi; tokenni yangilab qayta deploy qiling |
| Admin panelda «Maxfiy kalit noto'g'ri» | `ADMIN_SECRET` ≥8 belgi va Netlify'da saqlanganmi |
| «Hisob tizimi sozlanmagan» | `ACCESS_SECRET` ≥16 belgi; lokalda `.env` + serverni qayta ishga tushirish; Netlify'da env qo'shib, qayta deploy |
| Kirish huquqi berilmayapti | `ACCESS_SECRET` ≥16 belgi |
| Ro'yxatdan o'tish 503 qaytaradi | `ACCESS_SECRET` o'rnatilganmi |
| Email orqali ochish «hisob topilmadi» | Foydalanuvchi avval ro'yxatdan o'tganmi |
| Boshqa qurilmada ochilmayapti | Hisobga kirilganmi; to'lov shu hisobga bog'langanmi |
| Brauzerda eski versiya | Service worker keshini tozalang yoki sahifani qayta yuklang |

## Litsenziya va kontent

Barcha video darslar, matnlar va dizayn kurs egasiga tegishli. Materiallarni
nusxalash, qayta joylash yoki tijoriy maqsadda ishlatish taqiqlanadi.
Batafsil: `shartlar.html`.
