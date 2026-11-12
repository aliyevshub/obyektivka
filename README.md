# Obyektivka bot

Ishga kirish uchun **obyektivka (ma'lumotnoma)** tayyorlab beradigan Telegram bot.
Foydalanuvchi savollarga birma-bir javob beradi, bot tayyor hujjatni **Word (.docx)** va/yoki **PDF** ko'rinishida yuboradi.

Bot **Cloudflare Workers**'da ishlaydi (server shart emas), kod GitHub'da turadi va GitHub Actions orqali avtomatik joylanadi.

## Imkoniyatlari

- Hujjat **kirill**, **lotin** yoki **yangi lotin** (ş, ç, ö, ğ) yozuvida. Bot xabarlari ham tanlangan yozuvda chiqadi; foydalanuvchi istalgan yozuvda yozsa ham, javoblar tanlangan yozuvga o'giriladi.
- **Pullik xizmat (9 000 so'm, Word + PDF).** To'lovdan oldin ogohlantirish va tahrirlash imkoniyati; foydalanuvchi chek skrinshotini yuboradi, Workers AI rasm chekka o'xshashini tekshiradi, administrator Telegram'da «Tasdiqlash / Rad etish» tugmasini bosgach hujjat yuboriladi.
- **Yashirin promokod.** To'lov sahifasida tugma yoki yozuv yo'q: kodni biladigan foydalanuvchi uni shunchaki xabar qilib yuboradi. Administrator `/kod YANGIKOD` bilan o'rnatadi (eski kod bekor bo'ladi), `/kod` — amaldagi kod va ishlatilish soni. Kod ishlatilganda administratorga xabar keladi.
- 3×4 **rasm** o'ng yuqori burchakka qo'yiladi (kerak bo'lsa avtomatik qirqiladi).
- **Mehnat faoliyati** `2019-2023 — lavozim` ko'rinishida yoziladi, bir xabarda bir nechta qator yuborsa ham bo'ladi.
- **Yaqin qarindoshlar** jadvali 2-sahifada chiqadi.
- Har bir qadamda «⬅️ Orqaga» tugmasi bor.
- Oxirida **barcha ma'lumotlar ro'yxati** ko'rsatiladi, «✏️ Tahrirlash» orqali istalgan bandni alohida tuzatish mumkin.
- Ma'lumotlar **keyingi safar uchun saqlanadi**: `/start` bosilganda bot ulardan foydalanishni taklif qiladi.
- `/bekor` — joriy to'ldirishni bekor qilish, `/ochirish` — saqlangan ma'lumotlarni butunlay o'chirish.
- Tugallanmagan to'ldirishlar 7 kundan, saqlangan ma'lumotlar esa 180 kun foydalanilmasa avtomatik o'chiriladi.

## Hujjat tuzilishi

1-sahifa: **МАЪЛУМОТНОМА**, F.I.O., hozirgi ish joyi, rasm, keyin juft-juft bandlar:
tug'ilgan yili/joyi, millati/partiyaviyligi, ma'lumoti/tamomlagan, mutaxassisligi, ilmiy darajasi/unvoni,
chet tillari/harbiy unvoni, davlat mukofotlari, deputatligi va **МЕҲНАТ ФАОЛИЯТИ**.

2-sahifa: **… яқин қариндошлари ҳақида МАЪЛУМОТ** jadvali: qarindoshligi, F.I.O., tug'ilgan yili va joyi, ish joyi va lavozimi, turar joyi.

## Ishga tushirish (bir marta)

### 1. Telegram bot yaratish
Telegram'da **@BotFather** ga `/newbot` yozing, nom bering va **tokenni** nusxalab oling.

### 2. Cloudflare
1. https://dash.cloudflare.com da bepul akkaunt oching.
2. Chap menyudan **Workers & Pages** bo'limini bir marta oching. Shunda `*.workers.dev` subdomeningiz yaratiladi.
3. **Account ID** ni nusxalab oling (Workers & Pages sahifasining o'ng tomonida).
4. **My Profile → API Tokens → Create Token → "Edit Cloudflare Workers"** shablonini tanlang.
   Ruxsatlarga **Account → D1 → Edit** ni ham qo'shing va tokenni yarating.

### 3. GitHub Secrets
Repozitoriyda **Settings → Secrets and variables → Actions → New repository secret** orqali uchta kalit qo'shing:

| Nomi | Qiymati |
|---|---|
| `BOT_TOKEN` | @BotFather bergan token |
| `CLOUDFLARE_API_TOKEN` | 2.4-qadamdagi token |
| `CLOUDFLARE_ACCOUNT_ID` | 2.3-qadamdagi Account ID |
| `CARD_NUMBER` | To'lov qabul qilinadigan karta raqami |
| `CARD_OWNER` | Karta egasining ismi (ixtiyoriy) |

Administrator ID raqami `wrangler.toml` dagi `ADMIN_ID` da.

### 4. Joylash
Kod asosiy (default) branchga tushganda GitHub Actions o'zi ishga tushadi:
testlar → D1 bazasini yaratish → Worker'ni joylash → tokenni saqlash → Telegram webhook'ini ulash.

Qo'lda ishga tushirish ham mumkin: **Actions → Test va joylash → Run workflow**.
Tugagach, Telegram'da botingizga `/start` yozing.

## Narxi va cheklovlar

- **Word** hujjat ~3 ms protsessor vaqtida tayyorlanadi, bu Cloudflare'ning **bepul** tarifiga bemalol sig'adi.
- **PDF** shrift va rasm bilan ~60–170 ms oladi. Bepul tarifda bitta so'rovga 10 ms CPU ajratiladi,
  shuning uchun PDF bepul tarifda ishlamasligi mumkin (foydalanuvchi faylni olmaydi).
  Bu holda **Workers Paid** (oyiga $5) tarifiga o'ting: Cloudflare → Workers & Pages → Plans.
- Lotindan kirillga o'girish qoidaga asoslangan. Ruscha so'zlarda ba'zan farq bo'lishi mumkin (masalan, "kompyuter" → "компютер").
  Aniq yozilishi muhim bo'lsa, javobni darhol kirillda yozing, bot uni o'zgartirmaydi.
  Katta harfli lotin qisqartmalar (KUAF, TATU) o'zgarishsiz qoladi.

## Dasturchilar uchun

```bash
npm install
npm test          # testlar
npm run typecheck # tiplarni tekshirish
npm run sample    # out/ papkasida namuna docx va pdf
```

Mahalliy ishga tushirish: `.dev.vars` faylida `BOT_TOKEN=...` yozing, keyin:

```bash
npx wrangler d1 migrations apply obyektivka --local
npx wrangler dev
```

### Fayllar

| Fayl | Vazifasi |
|---|---|
| `src/index.ts` | Worker: webhook, `/setup`, D1 da holatni saqlash, fayllarni yuborish |
| `src/bot.ts` | Suhbat mantig'i (savollar ketma-ketligi, tugmalar, tekshiruvlar) |
| `src/fields.ts` | Savollar ro'yxati — yangi savol qo'shish shu yerda |
| `src/layout.ts` | Hujjat tuzilmasi (Word va PDF uchun umumiy) |
| `src/docx.ts` / `src/pdf.ts` | Word va PDF yaratish |
| `src/translit.ts` | Lotin ↔ kirill o'girish |
| `fonts/` | Liberation Serif (SIL OFL litsenziyasi) — PDF'da kirill harflari uchun |
