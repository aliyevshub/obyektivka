// O'zbek lotin <-> kirill o'girish.
// Foydalanuvchi qaysi yozuvda yozmasin, hujjat bitta tanlangan yozuvda chiqadi.

export type Script = "cyr" | "lat";

const APOS = "'’‘`ʻʼ";
const isApos = (c: string | undefined) => !!c && APOS.includes(c);
const isLetter = (c: string | undefined) => !!c && /\p{L}/u.test(c);
const LAT_VOWELS = "aeiouAEIOU";
const CYR_VOWELS = "аеёиоуэюяўАЕЁИОУЭЮЯЎ";

const LAT1: Record<string, string> = {
  a: "а", b: "б", c: "ц", d: "д", f: "ф", g: "г", h: "ҳ", i: "и", j: "ж", k: "к", l: "л",
  m: "м", n: "н", o: "о", p: "п", q: "қ", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в",
  x: "х", y: "й", z: "з",
};

// "Sh" -> "Ш": birinchi harf katta bo'lsa natija ham katta
function matchCase(src: string, out: string): string {
  return src === src.toLowerCase() ? out : out[0].toUpperCase() + out.slice(1);
}

/** Lotin yozuvidagi so'zni kirillga o'giradi. */
function latWordToCyr(w: string): string {
  // Lotincha qisqartmalar (KUAF, IT, TATU) o'zgarmaydi
  if (w.length >= 2 && w === w.toUpperCase() && /^[A-Z]+$/.test(w) && w.length <= 5) return w;
  let out = "";
  for (let i = 0; i < w.length; i++) {
    const c = w[i], lc = c.toLowerCase(), n = w[i + 1]?.toLowerCase(), prev = w[i - 1];
    const two = lc + (n ?? "");
    if ((lc === "o" || lc === "g") && isApos(w[i + 1])) {
      out += matchCase(c, lc === "o" ? "ў" : "ғ"); i++; continue;
    }
    if (lc === "y" && n === "o" && isApos(w[i + 2])) { out += matchCase(c, "й"); continue; }
    if (two === "sh" || two === "ch") {
      // "Is'hoq" kabi so'zlarda tutuq belgisi ajratib turadi, bu yerga kelmaydi
      out += matchCase(c, two === "sh" ? "ш" : "ч"); i++; continue;
    }
    if (lc === "y" && n && "oaue".includes(n)) {
      out += matchCase(c, { o: "ё", a: "я", u: "ю", e: "е" }[n]!); i++; continue;
    }
    if (lc === "e") {
      const start = !isLetter(prev) || LAT_VOWELS.includes(prev!);
      out += matchCase(c, start ? "э" : "е"); continue;
    }
    if (isApos(c)) { out += isLetter(prev) && isLetter(w[i + 1]) ? "ъ" : c; continue; }
    const m = LAT1[lc];
    out += m ? matchCase(c, m) : c;
  }
  // So'z to'liq katta harflarda bo'lsa (MEHNAT), natija ham katta
  if (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w)) out = out.toUpperCase();
  return out;
}

const CYR1: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l",
  м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts",
  ч: "ch", ш: "sh", щ: "sh", ы: "i", ь: "", ъ: "ʼ", э: "e", ю: "yu", я: "ya", ё: "yo",
  ў: "oʻ", қ: "q", ғ: "gʻ", ҳ: "h",
};

function cyrWordToLat(w: string): string {
  let out = "";
  for (let i = 0; i < w.length; i++) {
    const c = w[i], lc = c.toLowerCase(), prev = w[i - 1]?.toLowerCase();
    let m: string | undefined;
    if (lc === "е") m = !prev || !/\p{L}/u.test(prev) || CYR_VOWELS.includes(prev) || prev === "ъ" || prev === "ь" ? "ye" : "e";
    else m = CYR1[lc];
    if (m === undefined) { out += c; continue; }
    if (c !== lc && m) {
      const upperWord = w.length > 1 && w === w.toUpperCase();
      m = upperWord ? m.toUpperCase() : m[0].toUpperCase() + m.slice(1);
    }
    out += m;
  }
  return out;
}

const hasCyr = (s: string) => /[Ѐ-ӿ]/.test(s);
const hasLat = (s: string) => /[A-Za-z]/.test(s);

/** Matnni tanlangan yozuvga keltiradi. Qisman aralash matnlarda har bir so'z alohida o'giriladi. */
export function toScript(text: string, script: Script): string {
  return text.replace(/[\p{L}'’‘`ʻʼ]+/gu, (w) => {
    if (script === "cyr") return hasLat(w) ? latWordToCyr(w) : w;
    return hasCyr(w) ? cyrWordToLat(w) : w;
  });
}
