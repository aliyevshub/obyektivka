// Suhbat mantig'i: Telegram'ga bog'liq emas, shuning uchun testlarda oson tekshiriladi.
// Kiruvchi xabar + joriy holat -> yangi holat + javoblar.
//
// Barcha xabar matnlari shu yerda lotin yozuvida yoziladi va oxirida foydalanuvchi
// tanlagan yozuvga (kirill / lotin / yangi lotin) o'giriladi. Tugmalar o'zgarmaydi.
import { FIELDS, RELATIVE_FIELDS, workOptions, type Field } from "./fields";
import { parseWork } from "./layout";
import { toScript, type Script } from "./translit";

export const PRICE = "9 000 so'm";

export interface Session {
  step: "resume" | "script" | "field" | "photo" | "work" | "rel" | "format" | "edit" | "pay" | "waiting" | "done";
  i: number;
  script: Script;
  data: Record<string, string>;
  photo?: string; // Telegram file_id
  work: [string, string][];
  relatives: Record<string, string>[];
  rel: Record<string, string>;
  /** Hammasi bir marta to'ldirilgan: endi har bir tahrirdan keyin xulosaga qaytamiz */
  editing?: boolean;
}

export interface Incoming {
  text?: string;
  /** Rasm (yoki rasm-fayl) yuborilgan bo'lsa, uning file_id si */
  photoId?: string;
  /** Rasm bo'lmagan fayl yuborilgan bo'lsa */
  otherFile?: boolean;
  /** To'lov bosqichida yuborilgan rasm chekka o'xshaydimi (Worker AI orqali aniqlaydi) */
  isReceipt?: boolean;
}

export interface Context {
  /** Oldin hujjat tayyorlangan bo'lsa, o'sha ma'lumotlar (faqat /start da kerak) */
  saved?: Session | null;
  /** Amaldagi promokod */
  promoCode?: string | null;
  /** To'lov uchun karta */
  card?: { number?: string; owner?: string };
}

export interface Reply {
  text: string;
  keyboard?: string[][]; // undefined => klaviaturani olib tashlash
  /** Matn tanlangan yozuvga o'girilmasin (masalan, ikki yozuvdagi salomlashish) */
  raw?: boolean;
  /** Matn namuna 3×4 rasm ostida yuborilsin */
  samplePhoto?: boolean;
  /** Xabar ostida nusxalash tugmasi (bosilganda matn nusxalanadi) */
  copy?: { label: string; text: string };
}

export interface Result {
  session: Session | null;
  replies: Reply[];
  /** Hujjatni tayyorlab yuborish (promokod bilan) */
  generate?: boolean;
  /** Ishlatilgan promokod — administratorga xabar beriladi */
  promoUsed?: string;
  /** Foydalanuvchi chek yubordi — buyurtma yaratib, administratorga yuborish kerak */
  receipt?: string;
  /** Saqlangan ma'lumotlarni o'chirish kerak */
  deleteProfile?: boolean;
}

export const BTN = {
  back: "⬅️ Orqaga",
  done: "✅ Tayyor",
  skip: "⏭ O'tkazib yuborish",
  undo: "↩️ Oxirgisini o'chirish",
  restart: "🔄 Qaytadan boshlash",
  cyr: "Кирилл",
  lat: "Lotin",
  newLat: "Yangi lotin",
  edit: "✏️ Tahrirlash",
  useSaved: "✅ Ha, davom etish",
  fresh: "🆕 Yangidan boshlash",
  photo: "🖼 Rasm",
  work: "💼 Mehnat faoliyati",
  rels: "👨‍👩‍👧 Qarindoshlar",
  script: "🔤 Yozuv",
  toPay: "✅ Hammasi to'g'ri, to'lovga o'tish",
  copyCard: "📋 Karta raqamini nusxalash",
} as const;

const SCRIPT_NAMES: Record<Script, string> = { cyr: "kirill", lat: "lotin", new: "yangi lotin" };
const MAX_LEN = 600;

export function newSession(): Session {
  return { step: "script", i: 0, script: "cyr", data: {}, work: [], relatives: [], rel: {} };
}

// ---------- Matnni tanlangan yozuvga o'girish ----------

/** Bu qism o'girilmaydi (tugma nomlari, foydalanuvchi ma'lumotlari, Word/PDF kabi nomlar) */
export const keep = (s: string) => `\u0001${s}\u0002`;

/** Xabarni tanlangan yozuvga o'giradi: HTML teglar va keep() qismlariga tegmaydi */
export function localize(text: string, script: Script): string {
  return text
    .split(/(<[^>]+>|&[a-z]+;|&#\d+;|\u0001[^\u0002]*\u0002)/)
    .map((part) => {
      if (!part) return part;
      if (part[0] === "\u0001") return part.slice(1, -1);
      if (part[0] === "<" || part[0] === "&") return part;
      return script === "lat" ? part : toScript(part, script, { keepAbbr: false });
    })
    .join("");
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Foydalanuvchi kiritgan qiymatni hujjatdagidek yozuvga keltirib ko'rsatish */
function val(s: Session, v: string | undefined, n = 80): string {
  const t = toScript((v ?? "").replace(/\s+/g, " ").trim(), s.script);
  return keep(escapeHtml(t.length > n ? t.slice(0, n - 1) + "…" : t || "—"));
}

const k = keep;
const W = k("Word"), P = k("PDF");

function grid(options: string[], perRow = 2): string[][] {
  const rows: string[][] = [];
  for (let i = 0; i < options.length; i += perRow) rows.push(options.slice(i, i + perRow));
  return rows;
}

function ask(f: Field, step: string, nav: string[]): Reply {
  let text = `<b>${step}</b>\n${f.prompt}`;
  if (f.example) text += `\n\n<i>Masalan: ${escapeHtml(f.example)}</i>`;
  if (f.options?.length) text += `\n\n👇 Tugmani bosing yoki javobni o'zingiz yozing.`;
  const kb = [...grid(f.options ?? [], (f.options?.length ?? 0) > 4 ? 3 : 2)];
  if (nav.length) kb.push(nav);
  return { text, keyboard: kb };
}

// ---------- Xulosa ----------

/** Kiritilgan barcha ma'lumotlarning qisqa ko'rinishi */
export function summary(s: Session): string {
  const lines = FIELDS.filter((f) => !(f.key === "current_since" && !s.data.current_since)).map(
    (f) => `<b>${f.label}:</b> ${val(s, s.data[f.key])}`,
  );
  lines.push(`<b>Rasm:</b> ${s.photo ? "bor ✅" : "yo'q"}`);
  lines.push(`<b>Yozuv:</b> ${SCRIPT_NAMES[s.script]}`);
  const work = s.work.length ? s.work.map(([y, t]) => `• ${val(s, y)} – ${val(s, t, 60)}`).join("\n") : "—";
  const rels = s.relatives.length ? s.relatives.map((r) => `• ${val(s, r.relation, 20)}: ${val(s, r.fio, 50)}`).join("\n") : "—";
  return `📋 <b>Ma'lumotlaringiz</b>\n\n${lines.join("\n")}\n\n<b>Mehnat faoliyati:</b>\n${work}\n\n<b>Qarindoshlar:</b>\n${rels}`;
}

const WARNING =
  "⚠️⚠️⚠️ <b>DIQQAT! MUHIM OGOHLANTIRISH</b> ⚠️⚠️⚠️\n\n" +
  "To'lovni amalga oshirishdan oldin yuqorida keltirilgan <b>barcha ma'lumotlarni va rasmni sinchiklab tekshiring.</b>\n\n" +
  "❗️ To'lov tasdiqlangandan so'ng ma'lumotlarga <b>o'zgartirish kiritilmaydi</b> va to'langan mablag' <b>qaytarilmaydi.</b>\n\n" +
  `❗️ Xato aniqlansa, hozir <b>«${k(BTN.edit)}»</b> tugmasi orqali tuzating.\n\n` +
  `Ma'lumotlar to'g'riligiga ishonch hosil qilganingizdan so'nggina <b>«${k(BTN.toPay)}»</b> tugmasini bosing.`;

const EDIT_MENU = (): string[][] => [
  ...grid(FIELDS.map((f) => f.label!), 3),
  [BTN.photo, BTN.work],
  [BTN.rels, BTN.script],
  [BTN.back],
];

// ---------- Har bir bosqich uchun savol ----------

function prompt(s: Session, ctx: Context = {}): Reply[] {
  switch (s.step) {
    case "resume":
      return [{
        text:
          `Sizda oldingi ma'lumotlar saqlangan: <b>${val(s, s.data.fio)}</b>.\n\n` +
          "Ulardan foydalanib, kerakli joylarini tuzatasizmi yoki yangidan boshlaysizmi?",
        keyboard: [[BTN.useSaved], [BTN.fresh]],
      }];
    case "edit":
      return [{ text: "Qaysi bandni tuzatamiz? ✏️", keyboard: EDIT_MENU() }];
    case "script":
      return [{
        raw: true,
        text:
          "Hujjat qaysi yozuvda bo'lsin?\n\n" +
          "<b>Кирилл</b> — Маълумотнома\n<b>Lotin</b> — Ma'lumotnoma\n<b>Yangi lotin</b> — ş, ç, ö, ğ harflari bilan\n\n" +
          "Javoblarni istalgan yozuvda yozavering — bot ularni tanlangan yozuvga o'zi o'giradi.",
        keyboard: [[BTN.cyr, BTN.lat, BTN.newLat]],
      }];
    case "field": {
      const f = FIELDS[s.i];
      return [ask(f, `${s.i + 1}/${FIELDS.length}`, [BTN.back])];
    }
    case "photo":
      return [{
        samplePhoto: true,
        text:
          "📸 <b>Rasm (3×4)</b>\n\n" +
          "Rasmingizni shu namunadagidek yuboring:\n" +
          "✅ Oq yoki och rangli fon\n" +
          "✅ To'g'ri kameraga qarang\n" +
          "✅ Yuz va yelkalar to'liq ko'rinsin\n" +
          "✅ Rasm tiniq, yorug' bo'lsin\n\n" +
          "Rasmni <b>oddiy rasm sifatida</b> yuboring. U hujjatning o'ng yuqori burchagiga qo'yiladi." +
          (s.editing && s.photo ? `\n\nHozirgi rasmni olib tashlash uchun «${k(BTN.skip)}» ni bosing.` : ""),
        keyboard: [[BTN.skip], [BTN.back]],
      }];
    case "work": {
      const list = s.work.length
        ? "\n\nKiritilganlar:\n" + s.work.map(([y, t]) => `• ${val(s, y)} – ${val(s, t, 200)}`).join("\n")
        : "";
      return [{
        text:
          "<b>Mehnat faoliyati</b>\nHar bir ish joyini <b>yil oralig'i</b> bilan yozing. " +
          "Bir xabarda bir nechta qator yuborsa ham bo'ladi.\n\n" +
          "<i>Masalan:\n2019-2023 — Andijon davlat universiteti talabasi\n2023-h.v. — «Shams Soft» MChJ dasturchisi</i>\n\n" +
          "Hozirgi joy uchun ikkinchi yil o'rniga <b>h.v.</b> yoki <b>hozir</b> deb yozing. " +
          `Tugatgach «${k(BTN.done)}» ni bosing.` +
          list,
        keyboard: s.work.length ? [[BTN.done], [BTN.undo, BTN.back]] : [[BTN.done], [BTN.back]],
      }];
    }
    case "rel": {
      let f = RELATIVE_FIELDS[s.i];
      if (f.key === "work") f = { ...f, options: workOptions(s.rel.relation ?? "") };
      const n = s.relatives.length + 1;
      const head = `Qarindoshlar — ${n}-qarindosh (${s.i + 1}/${RELATIVE_FIELDS.length})`;
      const r = ask(f, head, [BTN.back]);
      if (s.i === 0) {
        if (s.relatives.length) r.keyboard!.splice(r.keyboard!.length - 1, 0, [BTN.undo]);
        r.text =
          (s.relatives.length
            ? `Qo'shilgan: ${s.relatives.map((x) => val(s, x.relation, 30)).join(", ")}.\n\nKeyingi qarindoshni qo'shing yoki «${k(BTN.done)}» ni bosing.\n\n`
            : "Endi yaqin qarindoshlaringiz haqida: ota-ona, aka-uka, opa-singil, turmush o'rtog'i va farzandlar.\n\n") +
          r.text;
        r.keyboard!.unshift([BTN.done]);
      }
      return [r];
    }
    case "format":
      return [
        { text: summary(s) },
        { text: WARNING, keyboard: [[BTN.toPay], [BTN.edit], [BTN.restart]] },
      ];
    case "pay": {
      const card = ctx.card?.number?.trim();
      const owner = ctx.card?.owner?.trim();
      const head = `💳 <b>To'lov</b>\n\nXizmat narxi: <b>${PRICE}</b> (${W} va ${P} hujjat birga).`;
      const howTo =
        "To'lovdan so'ng <b>to'lov chekini (skrinshot)</b> shu yerga rasm qilib yuboring. " +
        "Administrator tekshirib tasdiqlagach, hujjatlaringiz avtomatik yuboriladi.";
      if (!card) return [{ text: `${head}\n\n${howTo}`, keyboard: [[BTN.back]] }];
      // Bitta xabarda xabar ostidagi tugma va pastki klaviatura birga turolmaydi — ikki xabarga bo'lamiz
      return [
        {
          text:
            `${head}\n\nQuyidagi kartaga o'tkazing:\n<code>${k(escapeHtml(card))}</code>` +
            (owner ? `\n${k(escapeHtml(owner))}` : ""),
          copy: { label: BTN.copyCard, text: card },
        },
        { text: howTo, keyboard: [[BTN.back]] },
      ];
    }
    case "waiting":
      return [{ text: "⏳ To'lov chekingiz tekshirilmoqda. Administrator tasdiqlagach, hujjatlaringiz avtomatik yuboriladi." }];
    case "done":
      return [{ text: "✅ Hujjatlaringiz yuborilgan. Yangi hujjat tayyorlash uchun /start bosing." }];
  }
}

// ---------- Salomlashish ----------

const WELCOME_LAT =
  "Assalomu alaykum! 👋\n\n" +
  "Bu bot <b>obyektivka (ma'lumotnoma)</b> tayyorlab beradi.\n\n" +
  "📝 Savollarga birma-bir javob berasiz va 3×4 rasmingizni yuborasiz.\n" +
  "🔤 Hujjat 3 xil yozuvda tayyorlanadi: <b>kirill, lotin, yangi lotin</b>.\n" +
  `📄 Tayyor hujjat <b>${W}</b> va <b>${P}</b> ko'rinishida beriladi.\n` +
  "✏️ To'lovdan oldin barcha ma'lumotlarni tekshirib, tuzatish mumkin.\n\n" +
  `💰 Xizmat narxi: <b>${PRICE}</b>`;

const WELCOME: Reply = {
  raw: true,
  text: localize(WELCOME_LAT, "lat"),
};

// ---------- Tekshiruvlar ----------

const VALIDATORS: Record<string, (v: string) => string | null> = {
  fio: (v) => (v.split(/\s+/).length >= 2 ? null : "Familiya va ismni to'liq yozing (kamida 2 so'z)."),
  birth_date: (v) => (/\d{4}/.test(v) ? null : "Tug'ilgan yilni ham yozing, masalan: 04.01.2006"),
  current_since: (v) => (/^\d{4}$/.test(v) ? null : "Faqat yilni yozing, masalan: 2023"),
};

// ---------- Asosiy ishlov berish ----------

export function handle(prev: Session | null, msg: Incoming, ctx: Context = {}): Result {
  const res = route(prev, msg, ctx);
  const script = res.session?.script ?? prev?.script ?? "lat";
  res.replies = res.replies.map((r) => (r.raw ? r : { ...r, text: localize(r.text, script) }));
  return res;
}

function route(prev: Session | null, msg: Incoming, ctx: Context): Result {
  const text = msg.text?.trim() ?? "";

  if (text === "/start" || text.startsWith("/start ") || !prev) {
    const s: Session = ctx.saved ? { ...structuredClone(ctx.saved), step: "resume", i: 0, rel: {} } : newSession();
    return { session: s, replies: [WELCOME, ...prompt(s, ctx)] };
  }
  if (text === BTN.restart) {
    const s = newSession();
    return { session: s, replies: prompt(s, ctx) };
  }
  if (text === "/cancel" || text === "/bekor") {
    return { session: null, replies: [{ text: "Bekor qilindi. Qayta boshlash: /start" }] };
  }
  if (text === "/ochirish") {
    return {
      session: null,
      deleteProfile: true,
      replies: [{ text: "Barcha ma'lumotlaringiz o'chirildi 🗑\nQayta boshlash: /start" }],
    };
  }

  const s: Session = structuredClone(prev);
  const again = (warn?: string): Result => ({ session: s, replies: [...(warn ? [{ text: warn }] : []), ...prompt(s, ctx)] });
  const next = (): Result => ({ session: s, replies: prompt(s, ctx) });
  /** Tahrirlash rejimida xulosaga, aks holda keyingi bosqichga */
  const toSummary = (): Result => { s.step = "format"; s.i = 0; s.rel = {}; s.editing = true; return next(); };

  if (s.step === "waiting" || s.step === "done") return next();
  if (msg.photoId && s.step !== "photo" && s.step !== "pay") return again("Hozir rasm emas, matn kutilmoqda.");
  if (!text && s.step !== "photo" && s.step !== "pay") return again();
  if (text.length > MAX_LEN) return again(`Juda uzun (${text.length} belgi). ${MAX_LEN} belgidan qisqaroq yozing.`);

  switch (s.step) {
    case "resume":
      if (text === BTN.useSaved) return toSummary();
      if (text === BTN.fresh) { const n = newSession(); return { session: n, replies: prompt(n, ctx) }; }
      return again("Tugmalardan birini tanlang.");

    case "edit": {
      if (text === BTN.back) return toSummary();
      const idx = FIELDS.findIndex((f) => f.label === text);
      if (idx >= 0) { s.step = "field"; s.i = idx; return next(); }
      if (text === BTN.photo) { s.step = "photo"; return next(); }
      if (text === BTN.work) { s.step = "work"; return next(); }
      if (text === BTN.rels) { s.step = "rel"; s.i = 0; s.rel = {}; return next(); }
      if (text === BTN.script) { s.step = "script"; return next(); }
      return again("Tugmalardan birini tanlang.");
    }

    case "script": {
      if (text === BTN.back && s.editing) return toSummary();
      const chosen = ({ [BTN.cyr]: "cyr", [BTN.lat]: "lat", [BTN.newLat]: "new" } as Record<string, Script>)[text];
      if (chosen) {
        s.script = chosen;
        if (s.editing) return toSummary();
        s.step = "field"; s.i = 0;
        return next();
      }
      return again("Tugmalardan birini tanlang.");
    }

    case "field": {
      if (text === BTN.back) {
        if (s.editing) return toSummary();
        if (s.i === 0) s.step = "script"; else s.i--;
        return next();
      }
      const f = FIELDS[s.i];
      let value = text;
      if (text === BTN.skip || text === "O'tkazib yuborish") value = "";
      else if (f.key === "current_position" && text === "Vaqtincha ishlamaydi") s.data.current_since = "";
      const err = value && VALIDATORS[f.key]?.(value);
      if (err) return again(err);
      s.data[f.key] = value;
      if (s.editing) {
        // Ish joyi o'zgarsa, "qaysi yildan" ni ham so'raymiz
        if (f.key === "current_position" && value !== "Vaqtincha ishlamaydi") { s.i++; return next(); }
        return toSummary();
      }
      // Ishlamasa, "qaysi yildan" savolini o'tkazib yuboramiz
      if (f.key === "current_position" && value === "Vaqtincha ishlamaydi") s.i++;
      s.i++;
      if (s.i >= FIELDS.length) { s.step = "photo"; s.i = 0; }
      return next();
    }

    case "photo":
      if (msg.photoId) {
        s.photo = msg.photoId;
        const r = s.editing ? toSummary() : ((s.step = "work"), next());
        r.replies.unshift({ text: "Rasm qabul qilindi ✅" });
        return r;
      }
      if (msg.otherFile) return again("Bu rasm emas. JPG yoki PNG rasm yuboring.");
      if (text === BTN.back) { if (s.editing) return toSummary(); s.step = "field"; s.i = FIELDS.length - 1; return next(); }
      if (text === BTN.skip) { s.photo = undefined; if (s.editing) return toSummary(); s.step = "work"; return next(); }
      return again("Rasm yuboring yoki «O'tkazib yuborish» ni bosing.");

    case "work": {
      if (text === BTN.back) { if (s.editing) return toSummary(); s.step = "photo"; return next(); }
      if (text === BTN.done) { if (s.editing) return toSummary(); s.step = "rel"; s.i = 0; s.rel = {}; return next(); }
      if (text === BTN.undo) { s.work.pop(); return next(); }
      const bad: string[] = [];
      for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
        const w = parseWork(line);
        if (w) s.work.push(w); else bad.push(line);
      }
      if (bad.length)
        return again(
          `Quyidagi qator(lar)ni tushunmadim:\n${bad.map((b) => "• " + k(escapeHtml(b))).join("\n")}\n\n` +
            "Yil oralig'i bilan boshlang, masalan: <i>2019-2023 — maktab o'qituvchisi</i>",
        );
      return next();
    }

    case "rel": {
      if (text === BTN.back) {
        if (s.i === 0) { if (s.editing) return toSummary(); s.step = "work"; return next(); }
        s.i--;
        return next();
      }
      if (text === BTN.done && s.i === 0) return toSummary();
      if (text === BTN.undo && s.i === 0) { s.relatives.pop(); return next(); }
      const f = RELATIVE_FIELDS[s.i];
      s.rel[f.key] = text;
      s.i++;
      if (s.i >= RELATIVE_FIELDS.length) { s.relatives.push(s.rel); s.rel = {}; s.i = 0; }
      return next();
    }

    case "format": {
      if (text === BTN.edit || text === BTN.back) { s.step = "edit"; return next(); }
      if (text === BTN.toPay) { s.step = "pay"; return next(); }
      return again("Tugmalardan birini tanlang.");
    }

    case "pay": {
      if (text === BTN.back) return toSummary();
      // Yashirin promokod: tugma yo'q, kodni biladigan foydalanuvchi shunchaki yozib yuboradi
      const code = ctx.promoCode?.trim();
      if (text && code && text.toUpperCase() === code.toUpperCase()) {
        s.step = "done";
        return {
          session: s,
          generate: true,
          promoUsed: code,
          replies: [{ text: "✅ <b>Siz bepul promokoddan foydalandingiz.</b>\nHujjatlaringiz tayyorlanmoqda… ⏳" }],
        };
      }
      if (msg.photoId) {
        if (msg.isReceipt === false)
          return again(
            "❌ Yuborilgan rasm to'lov chekiga o'xshamaydi. " +
              "Iltimos, to'lov summasi va raqamlari ko'rinib turgan chek skrinshotini yuboring.",
          );
        s.step = "waiting";
        return {
          session: s,
          receipt: msg.photoId,
          replies: [{
            text:
              "✅ To'lov chekingiz qabul qilindi.\n\n" +
              "Administrator tekshirib tasdiqlagach, hujjatlaringiz (" + W + " va " + P + ") shu yerga avtomatik yuboriladi. " +
              "Iltimos, kuting.",
          }],
        };
      }
      if (msg.otherFile) return again("Chekni rasm (skrinshot) sifatida yuboring.");
      return again("To'lov chekini rasm (skrinshot) sifatida yuboring.");
    }

  }
  return next();
}

// ---------- Administrator tasdiqlagandan keyingi xabarlar ----------

export function approvedText(script: Script): string {
  return localize("✅ <b>To'lovingiz tasdiqlandi.</b> Hujjatlaringiz yuborilmoqda… ⏳", script);
}

export function rejectedText(script: Script): string {
  return localize(
    "❌ <b>To'lovingiz tasdiqlanmadi.</b>\n\n" +
      "Chek noto'g'ri yoki to'lov kelib tushmagan. To'lovni tekshirib, chekni qayta yuboring.",
    script,
  );
}

export function deliveredText(script: Script): string {
  return localize(
    "🎉 Hujjatlaringiz tayyor! Xizmatimizdan foydalanganingiz uchun rahmat.\n\n" +
      "Ma'lumotlaringiz saqlandi: keyingi safar /start bosib, faqat o'zgarganini yangilaysiz.",
    script,
  );
}
