// Namuna hujjatlarni yaratadi: npm run sample  -> out/ papkasi
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { buildDoc, type Resume } from "../src/layout";
import { buildDocx } from "../src/docx";
import { buildPdf } from "../src/pdf";
import { readPhoto } from "../src/image";
import { SAMPLE } from "../tests/sample-data";

const fonts = {
  regular: readFileSync("fonts/LiberationSerif-Regular.ttf"),
  bold: readFileSync("fonts/LiberationSerif-Bold.ttf"),
};
const photo = readPhoto(readFileSync("tests/photo.jpg")) ?? undefined;
mkdirSync("out", { recursive: true });
for (const script of ["cyr", "lat"] as const) {
  const r: Resume = { ...SAMPLE, script, photo };
  const doc = buildDoc(r);
  writeFileSync(`out/namuna-${script}.docx`, buildDocx(doc, photo));
  writeFileSync(`out/namuna-${script}.pdf`, await buildPdf(doc, fonts, photo));
}
console.log("out/ papkasiga yozildi");
