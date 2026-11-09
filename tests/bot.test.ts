import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { toScript } from "../src/translit";
import { buildDoc, parseWork } from "../src/layout";
import { buildDocx } from "../src/docx";
import { buildPdf } from "../src/pdf";
import { readPhoto } from "../src/image";
import { handle, summary, BTN, type Session } from "../src/bot";
import { FIELDS, RELATIVE_FIELDS } from "../src/fields";
import { SAMPLE } from "./sample-data";

describe("toScript", () => {
  it.each([
    ["Aliyev Abdulhamid Furqat o'g'li", "Алиев Абдулҳамид Фурқат ўғли"],
    ["yo'q", "йўқ"],
    ["Yo'q", "Йўқ"],
    ["Andijon shahar", "Андижон шаҳар"],
    ["Ma'lumotnoma", "Маълумотнома"],
    ["tugallanmagan oliy", "тугалланмаган олий"],
    ["Ingliz tili, rus tili", "Инглиз тили, рус тили"],
    ["Yetti yoshda Yunusobodda yashaydi", "Етти ёшда Юнусободда яшайди"],
    ["Shahrisabz, Chirchiq", "Шаҳрисабз, Чирчиқ"],
    ["poeziya, ekologiya", "поэзия, экология"],
    ["KUAF (kompyuter injiniringi)", "KUAF (компютер инжиниринги)"],
    ["2021-2023 yy.", "2021-2023 йй."],
    ["Андижон шаҳар", "Андижон шаҳар"],
  ])("lat->cyr: %s", (a, b) => expect(toScript(a, "cyr")).toBe(b));

  it.each([
    ["Алиев Абдулҳамид Фурқат ўғли", "Aliyev Abdulhamid Furqat oʻgʻli"],
    ["йўқ", "yoʻq"],
    ["Маълумотнома", "Maʼlumotnoma"],
    ["Чирчиқ шаҳар", "Chirchiq shahar"],
    ["Andijon", "Andijon"],
  ])("cyr->lat: %s", (a, b) => expect(toScript(a, "lat")).toBe(b));
});

describe("parseWork", () => {
  it.each([
    ["2015-2019 — maktab o'qituvchisi", ["2015-2019 yy.", "Maktab o'qituvchisi"]],
    ["2015–2019 yy. - maktab", ["2015-2019 yy.", "Maktab"]],
    ["2023-h.v. — «Shams Soft» MChJ dasturchisi", ["2023 y. – h.v.", "«Shams Soft» MChJ dasturchisi"]],
    ["2023 - hozir: dasturchi", ["2023 y. – h.v.", "Dasturchi"]],
    ["2020 y. — harbiy xizmat", ["2020 y.", "Harbiy xizmat"]],
    ["2020-2021 йй. — ўқитувчи", ["2020-2021 yy.", "Ўқитувчи"]],
  ])("%s", (line, want) => expect(parseWork(line)).toEqual(want));

  it("noto'g'ri qatorlar", () => {
    expect(parseWork("maktabda ishladim")).toBeNull();
    expect(parseWork("2019-2015 — orqaga")).toBeNull();
  });
});

describe("hujjatlar", () => {
  const photo = readPhoto(readFileSync("tests/photo.jpg"))!;
  const fonts = { regular: readFileSync("fonts/LiberationSerif-Regular.ttf"), bold: readFileSync("fonts/LiberationSerif-Bold.ttf") };

  it("rasm o'lchamini o'qiydi", () => {
    expect(photo).toMatchObject({ kind: "jpg", width: 600, height: 700 });
    expect(readPhoto(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("docx: kirill matnlar, rasm va qarindoshlar jadvali", () => {
    const doc = buildDoc({ ...SAMPLE, script: "cyr", photo });
    const files = unzipSync(buildDocx(doc, photo));
    const xml = strFromU8(files["word/document.xml"]);
    expect(xml).toContain("МАЪЛУМОТНОМА");
    expect(xml).toContain("Каримов Жасур Баҳодир ўғли");
    expect(xml).toContain("МЕҲНАТ ФАОЛИЯТИ");
    expect(xml).toContain("Қариндошлиги");
    expect(xml).toContain('w:type="page"');
    expect(files["word/media/photo.jpg"]).toBeDefined();
  });

  it("docx: rasmsiz va qarindoshsiz", () => {
    const doc = buildDoc({ ...SAMPLE, relatives: [], script: "lat" });
    const files = unzipSync(buildDocx(doc));
    const xml = strFromU8(files["word/document.xml"]);
    expect(xml).toContain("MA'LUMOTNOMA");
    expect(xml).not.toContain("w:drawing");
    expect(xml).not.toContain('w:type="page"');
  });

  it("pdf: yaratiladi", async () => {
    const bytes = await buildPdf(buildDoc({ ...SAMPLE, script: "cyr", photo }), fonts, photo);
    expect(strFromU8(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(10_000);
  });
});

describe("suhbat", () => {
  const say = (s: Session | null, text: string) => handle(s, { text });

  it("boshidan oxirigacha", () => {
    let r = say(null, "/start");
    expect(r.session!.step).toBe("script");
    r = say(r.session, BTN.cyr);
    expect(r.session!.step).toBe("field");

    const answers: Record<string, string> = { ...SAMPLE.data, current_since: "2023" };
    for (const f of FIELDS) {
      expect(r.replies.at(-1)!.text).toContain(f.prompt);
      r = say(r.session, answers[f.key] || "yo'q");
    }
    expect(r.session!.step).toBe("photo");
    r = handle(r.session, { photoId: "PHOTO1" });
    expect(r.session).toMatchObject({ step: "work", photo: "PHOTO1" });

    r = say(r.session, "2019-2023 — talaba\n2023-h.v. — dasturchi");
    expect(r.session!.work).toHaveLength(2);
    r = say(r.session, "noto'g'ri");
    expect(r.replies[0].text).toContain("tushunmadim");
    r = say(r.session, BTN.done);
    expect(r.session!.step).toBe("rel");

    for (const f of RELATIVE_FIELDS) r = say(r.session, f.key === "relation" ? "Otasi" : "x " + f.key);
    expect(r.session!.relatives).toHaveLength(1);
    r = say(r.session, BTN.done);
    expect(r.session!.step).toBe("format");

    r = say(r.session, BTN.both);
    expect(r.generate).toEqual(["docx", "pdf"]);
  });

  it("orqaga qaytish va tekshiruv", () => {
    let r = say(say(null, "/start").session, BTN.lat);
    r = say(r.session, "Ali");
    expect(r.replies[0].text).toContain("kamida 2 so'z");
    expect(r.session!.i).toBe(0);
    r = say(r.session, "Aliyev Vali");
    expect(r.session!.i).toBe(1);
    r = say(r.session, BTN.back);
    expect(r.session!.i).toBe(0);
    r = say(r.session, BTN.back);
    expect(r.session!.step).toBe("script");
  });

  it("ishlamasa, yil so'ralmaydi", () => {
    let r = say(say(say(null, "/start").session, BTN.cyr).session, "Aliyev Vali");
    r = say(r.session, "Vaqtincha ishlamaydi");
    expect(FIELDS[r.session!.i].key).toBe("birth_date");
  });

  it("ish joyi tugmalari qarindoshlikka mos", () => {
    let r = say(say(null, "/start").session, BTN.cyr);
    r.session!.step = "rel"; r.session!.i = 0;
    const until = (relation: string) => {
      let x = say(r.session, relation);
      x = say(x.session, "Aliyev Karim");
      x = say(x.session, "1970 yil, Andijon");
      return x.replies[0].keyboard!.flat();
    };
    expect(until("Otasi")).toEqual(["Nafaqada", "Vafot etgan", BTN.back]);
    expect(until("Onasi")).toContain("Uy bekasi");
    expect(until("O'g'li")).toContain("Maktabgacha yoshda");
    expect(until("Otasi")).not.toContain("Uy bekasi");
  });

  const finished = (): Session => ({
    step: "format", i: 0, script: "cyr", editing: true, rel: {},
    data: { ...SAMPLE.data }, work: [...SAMPLE.work], relatives: structuredClone(SAMPLE.relatives), photo: "P1",
  });

  it("xulosada barcha ma'lumotlar ko'rinadi", () => {
    const text = summary(finished());
    expect(text).toContain("Karimov Jasur");
    expect(text).toContain("Rasm:</b> bor");
    expect(text).toContain("Otasi");
  });

  it("tahrirlash: bitta bandni o'zgartirib xulosaga qaytadi", () => {
    let r = say(finished(), BTN.edit);
    expect(r.session!.step).toBe("edit");
    r = say(r.session, "Millati");
    expect(r.session).toMatchObject({ step: "field", i: FIELDS.findIndex((f) => f.key === "nationality") });
    r = say(r.session, "qoraqalpoq");
    expect(r.session!.step).toBe("format");
    expect(r.session!.data.nationality).toBe("qoraqalpoq");
    expect(r.replies[0].text).toContain("qoraqalpoq");
  });

  it("tahrirlash: ish joyi o'zgarsa yil ham so'raladi", () => {
    let r = say(say(finished(), BTN.edit).session, "Ish joyi");
    r = say(r.session, "Yangi kompaniya");
    expect(FIELDS[r.session!.i].key).toBe("current_since");
    r = say(r.session, "2026");
    expect(r.session!.step).toBe("format");
  });

  it("tahrirlash: rasm, mehnat faoliyati, qarindoshlar", () => {
    let r = say(say(finished(), BTN.edit).session, BTN.photo);
    r = handle(r.session, { photoId: "P2" });
    expect(r.session).toMatchObject({ step: "format", photo: "P2" });

    r = say(say(r.session, BTN.edit).session, BTN.work);
    r = say(r.session, "2026-h.v. — yangi ish");
    r = say(r.session, BTN.done);
    expect(r.session!.step).toBe("format");
    expect(r.session!.work).toHaveLength(3);

    r = say(say(r.session, BTN.edit).session, BTN.rels);
    expect(r.replies[0].keyboard!.flat()).toContain(BTN.undo);
    r = say(r.session, BTN.undo);
    expect(r.session!.relatives).toHaveLength(2);
    r = say(r.session, BTN.done);
    expect(r.session!.step).toBe("format");
  });

  it("saqlangan ma'lumotlardan foydalanish", () => {
    let r = handle(null, { text: "/start" }, finished());
    expect(r.session!.step).toBe("resume");
    expect(r.replies[1].text).toContain("Karimov Jasur");
    r = say(r.session, BTN.useSaved);
    expect(r.session!.step).toBe("format");
    expect(r.session!.data.fio).toBe(SAMPLE.data.fio);

    r = say(handle(null, { text: "/start" }, finished()).session, BTN.fresh);
    expect(r.session).toMatchObject({ step: "script", data: {} });
  });

  it("/ochirish saqlangan ma'lumotlarni o'chiradi", () => {
    const r = say(finished(), "/ochirish");
    expect(r).toMatchObject({ session: null, deleteProfile: true });
  });

  it("/bekor ma'lumotlarni o'chiradi", () => {
    const r = say(say(null, "/start").session, "/bekor");
    expect(r.session).toBeNull();
  });
});
