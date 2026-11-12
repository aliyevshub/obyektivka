// Word (.docx) yaratish: WordprocessingML qo'lda yoziladi va fflate bilan zip qilinadi.
// Kutubxonasiz bo'lgani uchun Cloudflare Workers'da juda tez ishlaydi.
import { zipSync, strToU8 } from "fflate";
import type { Doc, Photo } from "./layout";

const FONT = "Times New Roman";
const SZ = 28; // 14 pt (yarim punktlarda)
const CM = 567; // 1 sm twip'larda
const EMU_CM = 360000;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface P {
  bold?: boolean;
  size?: number;
  align?: "center" | "left" | "right" | "both";
  after?: number; // pt
  before?: number;
  keepNext?: boolean;
}

function run(text: string, o: P = {}): string {
  const rpr = `<w:rPr>${o.bold ? "<w:b/>" : ""}<w:sz w:val="${o.size ?? SZ}"/><w:szCs w:val="${o.size ?? SZ}"/></w:rPr>`;
  return text
    .split("\n")
    .map((line, i) => `<w:r>${rpr}${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${esc(line)}</w:t></w:r>`)
    .join("");
}

function para(text: string, o: P = {}, extraRuns = ""): string {
  const ppr =
    `<w:pPr>${o.keepNext ? "<w:keepNext/>" : ""}` +
    `<w:spacing w:before="${(o.before ?? 0) * 20}" w:after="${(o.after ?? 0) * 20}" w:line="240" w:lineRule="auto"/>` +
    `<w:jc w:val="${o.align ?? "left"}"/></w:pPr>`;
  return `<w:p>${ppr}${text ? run(text, o) : ""}${extraRuns}</w:p>`;
}

const NO_BORDERS =
  "<w:tblBorders>" +
  ["top", "left", "bottom", "right", "insideH", "insideV"].map((b) => `<w:${b} w:val="nil"/>`).join("") +
  "</w:tblBorders>";
const ALL_BORDERS =
  "<w:tblBorders>" +
  ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`)
    .join("") +
  "</w:tblBorders>";

function table(widths: number[], rows: string[], borders: string, cellMarginCm = 0.1): string {
  const total = widths.reduce((a, b) => a + b, 0);
  const m = Math.round(cellMarginCm * CM);
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblLayout w:type="fixed"/>${borders}` +
    `<w:tblCellMar><w:left w:w="${m}" w:type="dxa"/><w:right w:w="${m}" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${rows.join("")}</w:tbl>`
  );
}

function cell(width: number, content: string, opts: { span?: number; vAlign?: string } = {}): string {
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${opts.span ? `<w:gridSpan w:val="${opts.span}"/>` : ""}` +
    `${opts.vAlign ? `<w:vAlign w:val="${opts.vAlign}"/>` : ""}</w:tcPr>${content || "<w:p/>"}</w:tc>`
  );
}
const tr = (cells: string, header = false) =>
  `<w:tr><w:trPr><w:cantSplit/>${header ? "<w:tblHeader/>" : ""}</w:trPr>${cells}</w:tr>`;

function picture(p: Photo): string {
  const w = 3 * EMU_CM, h = 4 * EMU_CM;
  // Rasmni 3:4 nisbatga markazdan qirqish (foizning mingdan bir ulushlarida)
  const target = 3 / 4, ratio = p.width / p.height;
  let l = 0, t = 0;
  if (ratio > target) l = Math.round(((1 - target / ratio) / 2) * 100000);
  else if (ratio < target) t = Math.round(((1 - ratio / target) / 2) * 100000);
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${w}" cy="${h}"/>` +
    `<wp:docPr id="1" name="Rasm"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="1" name="photo.${p.kind}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rIdPhoto"/><a:srcRect l="${l}" t="${t}" r="${l}" b="${t}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  );
}

// A4: 21 sm, chap 2.5 sm, o'ng 1.5 sm => 17 sm matn kengligi
const TEXT_W = 16.5 * CM;

function body(d: Doc, photo?: Photo): string {
  const parts: string[] = [];

  // Sarlavha + rasm
  const head =
    para(d.title, { bold: true, size: 28, align: "center", after: 10, before: photo ? 12 : 0 }) +
    para(d.fio, { bold: true, size: 28, align: "center", after: 6 }) +
    (d.position ? para(d.position, { align: "center", after: 6 }) : "");
  if (photo) {
    const right = 3.6 * CM;
    parts.push(
      table([TEXT_W - right, right], [tr(cell(TEXT_W - right, head, { vAlign: "center" }) + cell(right, para("", { align: "right" }, picture(photo))))], NO_BORDERS, 0),
    );
  } else parts.push(head);
  parts.push(para("", { after: 4 }));

  // Asosiy ma'lumotlar
  const half = TEXT_W / 2;
  const block = (c: { label: string; value: string }) =>
    para(c.label, { bold: true, keepNext: true }) + para(c.value, { after: 6 });
  parts.push(
    table(
      [half, half],
      d.rows.map((row) =>
        tr(row.length === 2 ? cell(half, block(row[0])) + cell(half, block(row[1])) : cell(TEXT_W, block(row[0]), { span: 2 })),
      ),
      NO_BORDERS,
      0,
    ),
  );

  // Mehnat faoliyati
  parts.push(para(d.workTitle, { bold: true, size: 28, align: "center", before: 14, after: 8, keepNext: true }));
  if (d.work.length) {
    const yw = 3.6 * CM;
    parts.push(
      table(
        [yw, TEXT_W - yw],
        d.work.map(([y, s]) => tr(cell(yw, para(y + " –", { after: 3 })) + cell(TEXT_W - yw, para(s, { align: "both", after: 3 })))),
        NO_BORDERS,
        0,
      ),
    );
  }

  // Qarindoshlar — yangi sahifada
  if (d.relatives.length) {
    parts.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
    parts.push(para(d.relTitle, { bold: true, size: 28, align: "center", after: 12 }));
    const w = [2.9, 3.6, 3.2, 3.6, 3.2].map((x) => Math.round(x * CM));
    const small = { size: 24 }; // 12 pt
    parts.push(
      table(
        w,
        [
          tr(d.relHeaders.map((h, i) => cell(w[i], para(h, { ...small, bold: true, align: "center" }), { vAlign: "center" })).join(""), true),
          ...d.relatives.map((r) => tr(r.map((v, i) => cell(w[i], para(v, { ...small, bold: i === 0 }))).join(""))),
        ],
        ALL_BORDERS,
      ),
    );
  }

  const sect =
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="${Math.round(2 * CM)}" w:right="${Math.round(1.5 * CM)}" w:bottom="${Math.round(2 * CM)}" w:left="${Math.round(3 * CM)}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`;
  return parts.join("") + sect;
}

export function buildDocx(d: Doc, photo?: Photo): Uint8Array {
  const NS =
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body(d, photo)}</w:body></w:document>`;

  const styles =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults>` +
    `<w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:eastAsia="${FONT}"/>` +
    `<w:sz w:val="${SZ}"/><w:szCs w:val="${SZ}"/><w:lang w:val="uz-Cyrl-UZ"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>` +
    `</w:docDefaults></w:styles>`;

  const ct =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    `</Types>`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;

  const docRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    (photo
      ? `<Relationship Id="rIdPhoto" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/photo.${photo.kind}"/>`
      : "") +
    `</Relationships>`;

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(ct),
    "_rels/.rels": strToU8(rels),
    "word/document.xml": strToU8(document),
    "word/styles.xml": strToU8(styles),
    "word/_rels/document.xml.rels": strToU8(docRels),
  };
  if (photo) files[`word/media/photo.${photo.kind}`] = photo.bytes;
  return zipSync(files, { level: 6 });
}
