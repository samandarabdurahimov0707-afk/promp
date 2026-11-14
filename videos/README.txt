Bu papkaga lokal video fayllarni (mp4, webm) tashlang.

Masalan:
  videos/01-dars.mp4
  videos/02-dars.mp4

Keyin index.html faylining oxiridagi <div id="video-tags"> ichida
mos <video> tegining src qismini to'ldiring:

  <video preload="none"
         src="videos/01-dars.mp4"
         data-title="1-dars. Kirish"></video>

Bir nechta format kerak bo'lsa:

  <video data-title="1-dars. Kirish">
    <source src="videos/01-dars.mp4"  type="video/mp4">
    <source src="videos/01-dars.webm" type="video/webm">
  </video>

Har bir yangi <video> tegi = bitta yangi kartochka.
Hisoblagich avtomatik bittaga oshadi.

Eslatma: Netlify'da bitta fayl hajmi 100 MB dan oshmasligi kerak.
Katta videolar uchun YouTube (yoki boshqa video hosting) ishlatsangiz
sayt ancha yengil bo'ladi.
