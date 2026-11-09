// Suhbat mantig'i: Telegram'ga bog'liq emas, shuning uchun testlarda oson tekshiriladi.
// Kiruvchi xabar + joriy holat -> yangi holat + javoblar.
import { FIELDS, RELATIVE_FIELDS, workOptions, type Field } from "./fields";
import { parseWork } from "./layout";
import type { Script } from "./translit";

export type Format = "docx" | "pdf";

export interface Session {
  step: "script" | "field" | "photo" | "work" | "rel" | "format";
  i: number;
  script: Script;
  data: Record<string, string>;
  photo?: string; // Telegram file_id
  work: [string, string][];
  relatives: Record<string, string>[];
  rel: Record<string, string>;
}

export interface Incoming {
  text?: string;
  /** Rasm (yoki rasm-fayl) yuborilgan bo'lsa, uning file_id si */
  photoId?: string;
  /** Rasm bo'lmagan fayl yuborilgan bo'lsa */
  otherFile?: boolean;
}

export interface Reply {
  text: string;
  keyboard?: string[][]; // undefined => klaviaturani olib tashlash
}

export interface Result {
  session: Session | null;
  replies: Reply[];
  generate?: Format[];
}

export const BTN = {
  back: "⬅️ Orqaga",
  done: "✅ Tayyor",
  skip: "⏭ O'tkazib yuborish",
  undo: "↩️ Oxirgisini o'chirish",
  word: "📄 Word",
  pdf: "📕 PDF",
  both: "📄 + 📕 Ikkalasi",
  restart: "🔄 Qaytadan boshlash",
  cyr: "Кирилл",
  lat: "Lotin",
} as const;

const MAX_LEN = 600;

export function newSession(): Session {
  return { step: "script", i: 0, script: "cyr", data: {}, work: [], relatives: [], rel: {} };
}

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

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------- Har bir bosqich uchun savol ----------

function prompt(s: Session): Reply {
  switch (s.step) {
    case "script":
      return {
        text:
          "Hujjat qaysi yozuvda bo'lsin?\n\n" +
          "Javoblarni istalgan yozuvda yozavering — bot ularni tanlangan yozuvga o'zi o'giradi.",
        keyboard: [[BTN.cyr, BTN.lat]],
      };
    case "field": {
      const f = FIELDS[s.i];
      return ask(f, `${s.i + 1}/${FIELDS.length}`, [BTN.back]);
    }
    case "photo":
      return {
        text:
          "<b>Rasm</b>\n3×4 rasmingizni yuboring (oddiy rasm sifatida). " +
          "Rasm hujjatning o'ng yuqori burchagiga qo'yiladi.",
        keyboard: [[BTN.skip], [BTN.back]],
      };
    case "work": {
      const list = s.work.length
        ? "\n\nKiritilganlar:\n" + s.work.map(([y, t]) => `• ${y} – ${escapeHtml(t)}`).join("\n")
        : "";
      return {
        text:
          "<b>Mehnat faoliyati</b>\nHar bir ish joyini <b>yil oralig'i</b> bilan yozing. " +
          "Bir xabarda bir nechta qator yuborsa ham bo'ladi.\n\n" +
          "<i>Masalan:\n2019-2023 — Andijon davlat universiteti talabasi\n2023-h.v. — «Shams Soft» MChJ dasturchisi</i>\n\n" +
          "Hozirgi joy uchun ikkinchi yil o'rniga <b>h.v.</b> yoki <b>hozir</b> deb yozing. " +
          `Tugatgach «${BTN.done}» ni bosing.` +
          list,
        keyboard: s.work.length ? [[BTN.done], [BTN.undo, BTN.back]] : [[BTN.done], [BTN.back]],
      };
    }
    case "rel": {
      let f = RELATIVE_FIELDS[s.i];
      if (f.key === "work") f = { ...f, options: workOptions(s.rel.relation ?? "") };
      const n = s.relatives.length + 1;
      const head = `Qarindoshlar — ${n}-qarindosh (${s.i + 1}/${RELATIVE_FIELDS.length})`;
      const r = ask(f, head, [BTN.back]);
      if (s.i === 0) {
        r.text =
          (s.relatives.length
            ? `Qo'shilgan: ${s.relatives.map((x) => escapeHtml(x.relation)).join(", ")}.\n\nKeyingi qarindoshni qo'shing yoki «${BTN.done}» ni bosing.\n\n`
            : "Endi yaqin qarindoshlaringiz haqida: ota-ona, aka-uka, opa-singil, turmush o'rtog'i va farzandlar.\n\n") +
          r.text;
        r.keyboard!.unshift([BTN.done]);
      }
      return r;
    }
    case "format":
      return {
        text: "Hammasi tayyor! ✅\nHujjatni qaysi formatda yuboray?",
        keyboard: [[BTN.word, BTN.pdf], [BTN.both], [BTN.back, BTN.restart]],
      };
  }
}

// ---------- Asosiy ishlov berish ----------

const WELCOME =
  "Assalomu alaykum! 👋\n\n" +
  "Men <b>obyektivka</b> (ma'lumotnoma) tayyorlab beraman. Savollarga birma-bir javob bering, " +
  "oxirida tayyor hujjatni <b>Word</b> yoki <b>PDF</b> ko'rinishida yuboraman.\n\n" +
  "Xato yozsangiz «⬅️ Orqaga» tugmasi bilan qaytishingiz mumkin. Boshidan boshlash: /start";

const VALIDATORS: Record<string, (v: string) => string | null> = {
  fio: (v) => (v.split(/\s+/).length >= 2 ? null : "Familiya va ismni to'liq yozing (kamida 2 so'z)."),
  birth_date: (v) => (/\d{4}/.test(v) ? null : "Tug'ilgan yilni ham yozing, masalan: 04.01.2006"),
  current_since: (v) => (/^\d{4}$/.test(v) ? null : "Faqat yilni yozing, masalan: 2023"),
};

export function handle(prev: Session | null, msg: Incoming): Result {
  const text = msg.text?.trim() ?? "";

  if (text === "/start" || text.startsWith("/start ") || text === BTN.restart || !prev) {
    const s = newSession();
    return { session: s, replies: [{ text: WELCOME }, prompt(s)] };
  }
  if (text === "/cancel" || text === "/bekor") {
    return { session: null, replies: [{ text: "Bekor qilindi. Kiritilgan ma'lumotlar o'chirildi. Qayta boshlash: /start" }] };
  }

  const s: Session = structuredClone(prev);
  const again = (warn?: string): Result => ({ session: s, replies: [...(warn ? [{ text: warn }] : []), prompt(s)] });
  const next = (): Result => ({ session: s, replies: [prompt(s)] });

  if (msg.photoId && s.step !== "photo") return again("Hozir rasm emas, matn kutilmoqda.");
  if (!text && s.step !== "photo") return again();
  if (text.length > MAX_LEN) return again(`Juda uzun (${text.length} belgi). ${MAX_LEN} belgidan qisqaroq yozing.`);

  switch (s.step) {
    case "script":
      if (text === BTN.cyr || text === BTN.lat) {
        s.script = text === BTN.cyr ? "cyr" : "lat";
        s.step = "field"; s.i = 0;
        return next();
      }
      return again("Tugmalardan birini tanlang.");

    case "field": {
      if (text === BTN.back) {
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
      // Ishlamasa, "qaysi yildan" savolini o'tkazib yuboramiz
      if (f.key === "current_position" && value === "Vaqtincha ishlamaydi") s.i++;
      s.i++;
      if (s.i >= FIELDS.length) { s.step = "photo"; s.i = 0; }
      return next();
    }

    case "photo":
      if (msg.photoId) { s.photo = msg.photoId; s.step = "work"; return { session: s, replies: [{ text: "Rasm qabul qilindi ✅" }, prompt(s)] }; }
      if (msg.otherFile) return again("Bu rasm emas. JPG yoki PNG rasm yuboring.");
      if (text === BTN.back) { s.step = "field"; s.i = FIELDS.length - 1; return next(); }
      if (text === BTN.skip) { s.photo = undefined; s.step = "work"; return next(); }
      return again("Rasm yuboring yoki «O'tkazib yuborish» ni bosing.");

    case "work": {
      if (text === BTN.back) { s.step = "photo"; return next(); }
      if (text === BTN.done) { s.step = "rel"; s.i = 0; s.rel = {}; return next(); }
      if (text === BTN.undo) { s.work.pop(); return next(); }
      const bad: string[] = [];
      for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
        const w = parseWork(line);
        if (w) s.work.push(w); else bad.push(line);
      }
      if (bad.length)
        return again(
          `Quyidagi qator(lar)ni tushunmadim:\n${bad.map((b) => "• " + escapeHtml(b)).join("\n")}\n\n` +
            "Yil oralig'i bilan boshlang, masalan: <i>2019-2023 — maktab o'qituvchisi</i>",
        );
      return next();
    }

    case "rel": {
      if (text === BTN.back) {
        if (s.i === 0) { s.step = "work"; return next(); }
        s.i--;
        return next();
      }
      if (text === BTN.done && s.i === 0) { s.step = "format"; return next(); }
      const f = RELATIVE_FIELDS[s.i];
      s.rel[f.key] = text;
      s.i++;
      if (s.i >= RELATIVE_FIELDS.length) { s.relatives.push(s.rel); s.rel = {}; s.i = 0; }
      return next();
    }

    case "format": {
      if (text === BTN.back) { s.step = "rel"; s.i = 0; return next(); }
      const map: Record<string, Format[]> = { [BTN.word]: ["docx"], [BTN.pdf]: ["pdf"], [BTN.both]: ["docx", "pdf"] };
      const formats = map[text];
      if (!formats) return again("Formatni tugma orqali tanlang.");
      return {
        session: s,
        replies: [{ text: "Tayyorlanmoqda… ⏳" }],
        generate: formats,
      };
    }
  }
}

/** Fayl yuborilgandan keyin ko'rsatiladigan xabar */
export function afterSend(s: Session): Reply {
  return {
    text: "Tayyor! 🎉 Boshqa formatda ham olishingiz yoki orqaga qaytib tuzatishingiz mumkin.",
    keyboard: prompt(s).keyboard,
  };
}
