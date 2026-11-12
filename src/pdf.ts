// PDF yaratish (pdf-lib). Kirill harflari uchun Liberation Serif shrifti ichiga joylanadi.
import { PDFDocument, rgb, pushGraphicsState, popGraphicsState, rectangle, clip, endPath, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Doc, Photo } from "./layout";

export interface Fonts {
  regular: Uint8Array | ArrayBuffer;
  bold: Uint8Array | ArrayBuffer;
}

const CM = 72 / 2.54;
const PAGE_W = 595.28, PAGE_H = 841.89;
const ML = 3 * CM, MR = 1.5 * CM, MT = 2 * CM, MB = 2 * CM;
const TEXT_W = PAGE_W - ML - MR;
const SIZE = 14, BIG = 14, SMALL = 12;
const lh = (size: number) => size * 1.18;

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const tryLine = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(tryLine, size) <= width) { line = tryLine; continue; }
      if (line) out.push(line);
      // Juda uzun so'zni harflab bo'lamiz
      let w = word;
      while (font.widthOfTextAtSize(w, size) > width && w.length > 1) {
        let n = w.length - 1;
        while (n > 1 && font.widthOfTextAtSize(w.slice(0, n), size) > width) n--;
        out.push(w.slice(0, n));
        w = w.slice(n);
      }
      line = w;
    }
    out.push(line);
  }
  return out;
}

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(private pdf: PDFDocument) { this.newPage(); }
  newPage() { this.page = this.pdf.addPage([PAGE_W, PAGE_H]); this.y = PAGE_H - MT; }
  ensure(h: number) { if (this.y - h < MB) this.newPage(); }

  /** Matn blokini chizadi va uning balandligini qaytaradi (draw=false bo'lsa faqat o'lchaydi). */
  text(s: string, o: { font: PDFFont; size: number; x: number; width: number; y?: number; align?: "left" | "center"; draw?: boolean }): number {
    const lines = wrap(s, o.font, o.size, o.width);
    if (o.draw !== false) {
      let y = (o.y ?? this.y) - o.size;
      for (const line of lines) {
        const w = o.font.widthOfTextAtSize(line, o.size);
        const x = o.align === "center" ? o.x + (o.width - w) / 2 : o.x;
        this.page.drawText(line, { x, y, size: o.size, font: o.font, color: rgb(0, 0, 0) });
        y -= lh(o.size);
      }
    }
    return lines.length * lh(o.size);
  }
}

export async function buildPdf(d: Doc, fonts: Fonts, photo?: Photo): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`${d.title} — ${d.fio}`);
  const reg = await pdf.embedFont(fonts.regular, { subset: true });
  const bold = await pdf.embedFont(fonts.bold, { subset: true });
  const w = new Writer(pdf);

  // ---------- Sarlavha va rasm ----------
  const photoW = 3 * CM, photoH = 4 * CM;
  const headW = photo ? TEXT_W - photoW - 0.4 * CM : TEXT_W;
  const head: [string, PDFFont, number, number][] = [
    [d.title, bold, BIG, 8],
    [d.fio, bold, BIG, 6],
  ];
  if (d.position) head.push([d.position, reg, SIZE, 0]);
  const headH = head.reduce((h, [s, f, size, gap]) => h + w.text(s, { font: f, size, x: ML, width: headW, draw: false }) + gap, 0);
  const blockH = photo ? Math.max(photoH, headH) : headH;
  let y = w.y - (blockH - headH) / 2;
  for (const [s, f, size, gap] of head) y -= w.text(s, { font: f, size, x: ML, width: headW, y, align: "center" }) + gap;

  if (photo) {
    const img = photo.kind === "png" ? await pdf.embedPng(photo.bytes) : await pdf.embedJpg(photo.bytes);
    const bx = PAGE_W - MR - photoW, by = w.y - photoH;
    // 3:4 ramkani to'liq qoplaydigan qilib kattalashtirib, ortiqchasini qirqamiz
    const s = Math.max(photoW / img.width, photoH / img.height);
    const iw = img.width * s, ih = img.height * s;
    w.page.pushOperators(pushGraphicsState(), rectangle(bx, by, photoW, photoH), clip(), endPath());
    w.page.drawImage(img, { x: bx + (photoW - iw) / 2, y: by + (photoH - ih) / 2, width: iw, height: ih });
    w.page.pushOperators(popGraphicsState());
  }
  w.y -= blockH + 14;

  // ---------- Asosiy ma'lumotlar ----------
  const half = TEXT_W / 2, gap = 8;
  for (const row of d.rows) {
    const colW = row.length === 2 ? half - 6 : TEXT_W;
    const heights = row.map((c) =>
      w.text(c.label, { font: bold, size: SIZE, x: 0, width: colW, draw: false }) +
      w.text(c.value, { font: reg, size: SIZE, x: 0, width: colW, draw: false }),
    );
    const h = Math.max(...heights);
    w.ensure(h);
    row.forEach((c, i) => {
      const x = ML + i * half;
      const lh1 = w.text(c.label, { font: bold, size: SIZE, x, width: colW });
      w.text(c.value, { font: reg, size: SIZE, x, width: colW, y: w.y - lh1 });
    });
    w.y -= h + gap;
  }

  // ---------- Mehnat faoliyati ----------
  w.y -= 10;
  w.ensure(lh(BIG) * 3);
  w.y -= w.text(d.workTitle, { font: bold, size: BIG, x: ML, width: TEXT_W, align: "center" }) + 10;
  const yw = 3.6 * CM;
  for (const [years, s] of d.work) {
    const h = Math.max(
      w.text(s, { font: reg, size: SIZE, x: 0, width: TEXT_W - yw, draw: false }),
      lh(SIZE),
    );
    w.ensure(h);
    w.text(`${years} –`, { font: reg, size: SIZE, x: ML, width: yw });
    w.text(s, { font: reg, size: SIZE, x: ML + yw, width: TEXT_W - yw });
    w.y -= h + 4;
  }

  // ---------- Qarindoshlar jadvali ----------
  if (d.relatives.length) {
    w.newPage();
    w.y -= w.text(d.relTitle, { font: bold, size: BIG, x: ML, width: TEXT_W, align: "center" }) + 14;
    const colsCm = [3.2, 3.5, 3.1, 3.5, 3.2];
    const k = TEXT_W / colsCm.reduce((a, b) => a + b, 0) / CM;
    const cols = colsCm.map((c) => c * CM * k);
    const pad = 4;

    const drawRow = (cells: string[], header: boolean) => {
      const font = (i: number) => (header || i === 0 ? bold : reg);
      const SMALL = header ? 11 : 12;
      const h = Math.max(...cells.map((c, i) => w.text(c, { font: font(i), size: SMALL, x: 0, width: cols[i] - pad * 2, draw: false }))) + pad * 2;
      return {
        h,
        draw: () => {
          let x = ML;
          cells.forEach((c, i) => {
            w.page.drawRectangle({ x, y: w.y - h, width: cols[i], height: h, borderColor: rgb(0, 0, 0), borderWidth: 0.6 });
            const th = w.text(c, { font: font(i), size: SMALL, x: x + pad, width: cols[i] - pad * 2, draw: false });
            w.text(c, {
              font: font(i), size: SMALL, x: x + pad, width: cols[i] - pad * 2,
              y: header ? w.y - (h - th) / 2 : w.y - pad, align: header ? "center" : "left",
            });
            x += cols[i];
          });
          w.y -= h;
        },
      };
    };
    const header = drawRow(d.relHeaders, true);
    header.draw();
    for (const r of d.relatives) {
      const row = drawRow(r, false);
      if (w.y - row.h < MB) { w.newPage(); header.draw(); }
      row.draw();
    }
  }

  return pdf.save();
}
