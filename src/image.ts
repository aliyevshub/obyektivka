import type { Photo } from "./layout";

/** JPEG yoki PNG baytlaridan turini va o'lchamini aniqlaydi. Boshqa formatlar uchun null. */
export function readPhoto(bytes: Uint8Array): Photo | null {
  // PNG: 8 bayt imzo, keyin IHDR (kenglik/balandlik 16..23 baytlarda)
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset);
    return { bytes, kind: "png", width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  // JPEG: SOFn markerini qidiramiz
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const m = bytes[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { i += m === 0xff ? 1 : 2; continue; }
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        const height = (bytes[i + 5] << 8) | bytes[i + 6];
        const width = (bytes[i + 7] << 8) | bytes[i + 8];
        return width && height ? { bytes, kind: "jpg", width, height } : null;
      }
      i += 2 + len;
    }
  }
  return null;
}
