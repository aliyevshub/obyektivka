// Word va PDF uchun umumiy tuzilma. Ikkala format ham shu yerdan o'qiydi,
// shuning uchun hujjatlar bir xil chiqadi.
import { NONE } from "./fields";
import { toScript, type Script } from "./translit";

export interface Photo {
  bytes: Uint8Array;
  kind: "jpg" | "png";
  width: number;
  height: number;
}

export interface Resume {
  script: Script;
  data: Record<string, string>;
  work: [years: string, text: string][];
  relatives: Record<string, string>[];
  photo?: Photo;
}

export interface Cell {
  label: string;
  value: string;
}
/** Bitta (butun kenglikdagi) yoki ikkita (yonma-yon) katak */
export type Row = Cell[];

export interface Doc {
  title: string;
  fio: string;
  position: string;
  rows: Row[];
  workTitle: string;
  work: [string, string][];
  relTitle: string;
  relHeaders: string[];
  relatives: string[][];
}

const REL_KEYS = ["relation", "fio", "birth", "work", "address"];

/** Javoblarni tayyor hujjat matnlariga aylantiradi (tanlangan yozuvda). */
export function buildDoc(r: Resume): Doc {
  const t = (s: string) => toScript(s, r.script);
  const v = (key: string) => t((r.data[key] ?? "").trim() || NONE);
  const fio = t((r.data.fio ?? "").trim());

  const pair = (l1: string, k1: string, l2: string, k2: string): Row => [
    { label: t(l1), value: v(k1) },
    { label: t(l2), value: v(k2) },
  ];
  const one = (l: string, k: string): Row => [{ label: t(l), value: v(k) }];

  let position = (r.data.current_position ?? "").trim();
  const since = (r.data.current_since ?? "").trim();
  if (position && /^\d{4}$/.test(since)) position = `${since} yildan:\n${position}`;

  return {
    title: t("Ma'lumotnoma").toUpperCase(),
    fio,
    position: t(position),
    rows: [
      pair("Tug'ilgan yili:", "birth_date", "Tug'ilgan joyi:", "birth_place"),
      pair("Millati:", "nationality", "Partiyaviyligi:", "party"),
      pair("Ma'lumoti:", "education", "Tamomlagan:", "graduated"),
      one("Ma'lumoti bo'yicha mutaxassisligi:", "specialty"),
      pair("Ilmiy darajasi:", "degree", "Ilmiy unvoni:", "academic_title"),
      pair("Qaysi chet tillarini biladi:", "languages", "Harbiy (maxsus) unvoni:", "military_rank"),
      one("Davlat mukofotlari bilan taqdirlanganmi (qanaqa):", "awards"),
      one(
        "Xalq deputatlari, respublika, viloyat, shahar va tuman Kengashi deputatimi yoki boshqa " +
          "saylanadigan organlarning a'zosimi (to'liq ko'rsatilishi lozim):",
        "deputy",
      ),
    ],
    workTitle: t("Mehnat faoliyati").toUpperCase(),
    work: r.work.map(([y, s]) => [t(y), t(s)]),
    relTitle: `${fio ? fio + t("ning yaqin qarindoshlari haqida") : t("Yaqin qarindoshlari haqida")}\n${t("Ma'lumot").toUpperCase()}`,
    relHeaders: [
      "Qarindoshligi",
      "Familiyasi, ismi va otasining ismi",
      "Tug'ilgan yili va joyi",
      "Ish joyi va lavozimi",
      "Turar joyi",
    ].map(t),
    relatives: r.relatives.map((rel) => REL_KEYS.map((k) => t((rel[k] ?? "").trim() || NONE))),
  };
}

// ---------- Mehnat faoliyati qatorlari ----------

const WORK_RE = new RegExp(
  String.raw`^\s*(\d{4})` +
    String.raw`(?:\s*[-–—]\s*(\d{4}|h\.?\s?v\.?|hozir(?:gacha)?|hozirgi\s+vaqtgacha|ҳ\.?\s?в\.?|ҳозир(?:гача)?))?` +
    String.raw`\s*(?:yy?\.?|yil(?:lar)?|йй?\.?|йил(?:лар)?)?` +
    String.raw`\s*(?:[-–—:]\s*)?(\S[\s\S]*?)\s*$`,
  "iu",
);

/** "2015-2019 — maktab o'qituvchisi" -> ["2015-2019 yy.", "Maktab o'qituvchisi"] */
export function parseWork(line: string): [string, string] | null {
  const m = WORK_RE.exec(line);
  if (!m || m[3].length < 2) return null;
  const [, start, end, text] = m;
  let years: string;
  if (!end) years = `${start} y.`;
  else if (/^\d{4}$/.test(end)) {
    if (+end < +start) return null;
    years = `${start}-${end} yy.`;
  } else years = `${start} y. – h.v.`;
  return [years, text[0].toUpperCase() + text.slice(1)];
}
