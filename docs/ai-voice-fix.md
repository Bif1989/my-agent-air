# Ovozli AI tuzatishlari — 2026-10-08

Base: c60327b (audit commitlaridan keyingi mobil klaviatura tuzatishi saqlangan).
Branch: fix/ai-voice-safety. O'zgarishlar faqat lokal; GitHub push, migratsiya qo'llash va deploy bajarilmagan.

## Tayyor o'zgarishlar

- Mikrofon ruxsati kutilayotganda takroriy bosish bloklanadi.
- Route o'zgarishi, logout/hisob almashishi, yashirilgan tab, pagehide va textarea olib tashlanishida yozuv bekor qilinadi; kech kelgan mikrofon streami yopiladi, kech natija tashlanadi.
- Recorder xatosida streamlar va taymerlar yopiladi. Har bir yozuv alohida chunklar bilan ishlaydi.
- 90 soniyalik yozuv chegarasi va 4 MiB audio chegarasi; frontend yozuv davomida hajmni kuzatadi. Backend multipart body uchun 64 KiB qo'shimcha joy ajratadi va Content-Length bo'lmasa ham o'qishni chegaralaydi.
- Client 40 soniya, server 25 soniya timeout. Abort response body o'qish va multipart uploadda ham saqlanadi.
- Access token oldindan yangilanadi; 401 javobida ayni audio yangi token bilan faqat bir marta qayta yuboriladi. Logout/hisob o'zgarishidan keyin qayta yuborilmaydi.
- MIME turi va extension serverda moslashtiriladi. Uz/Ru foydalanuvchi xatolari kodlar asosida ko'rsatiladi.
- Ovoz uchun alohida persistent kvota: foydalanuvchiga kuniga 20 urinish, umumiy kunlik 100 urinish, bir foydalanuvchi uchun 30 soniyalik oraliq. Kun Asia/Tashkent bo'yicha. Chat kvotasi iste'mol qilinmaydi.
- OPENAI_API_KEY serverda qoladi. Kalit yo'q yoki provider uni rad etsa AI_NOT_CONFIGURED. Kvota RPC mavjud bo'lmasa pullik chaqiruv bajarilmaydi.

## Tekshiruvlar

- npm test: 63 test o'tdi (16 yangi voice testi).
- npx next typegen va npx tsc --noEmit: o'tdi.
- O'zgargan TypeScript/TSX fayllari ESLint: o'tdi.
- npm run build: o'tdi.
- tests/ai-voice-quota-check.cjs: izolatsiyalangan PGlite/Postgresda auth, anonymous, cooldown, chat bilan mustaqillik, kunlik limitlar, inactive account va permission tekshiruvlari o'tdi. Production Supabase ishlatilmadi; alohida server instansiyalari o'rtasidagi parallel yuk sinovi o'tkazilmadi.

## Keyingi rollout uchun zarur

1. Alohida ruxsatdan keyin voice migratsiyasini mavjud assistant quota migratsiyasidan so'ng qo'llash. Bu yozuv audio yoki transkript saqlamaydi; mavjud ai_private.assistant_usage hisoblagichidan foydalanadi.
2. Production OPENAI_API_KEY va OPENAI_TRANSCRIBE_MODEL sozlamalarini tekshirish. Kalit qiymatini mijozga yoki loglarga chiqarish mumkin emas.
3. Haqiqiy Android Chrome va iPhone Safari'da yozuv/ruxsat rad etilishi/ekran qulfi/route almashishi/offline/sessiya yangilanishini tekshirish. Hozirgi recorder/provider testlari mocklar bilan bajarilgan; haqiqiy qurilma va OpenAI chaqiruvi tekshirilmagan.
4. Shundan keyin alohida deploy ruxsati bilan publish qilish. GitHub push Vercel preview yoki productionni ishga tushirishi mumkin; hozir push qilinmagan.

## Paketni lokal checkoutga qo'llash

`ai-voice-safety.patch` git patch bo'lib, c60327b bazasiga tayyorlangan. Avval checkout boshidagi yangi o'zgarishlarni tekshiring. So'ng `git apply --check ai-voice-safety.patch`, undan keyin `git apply ai-voice-safety.patch` ishlatiladi. Patchni qo'llash o'zi deploy emas; push/migratsiya/deploy uchun alohida ruxsat kerak.
