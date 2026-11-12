// Telegram Bot API bilan ishlash uchun kichik yordamchilar.
import type { Reply } from "./bot";

export class Telegram {
  constructor(
    private token: string,
    private api = "https://api.telegram.org",
  ) {}

  async call<T = unknown>(method: string, body: Record<string, unknown> | FormData): Promise<T> {
    const res = await fetch(`${this.api}/bot${this.token}/${method}`, {
      method: "POST",
      ...(body instanceof FormData
        ? { body }
        : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    });
    const json = (await res.json()) as { ok: boolean; result: T; description?: string };
    if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`);
    return json.result;
  }

  send(chatId: number, r: Reply) {
    return this.call("sendMessage", {
      chat_id: chatId,
      text: r.text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: Telegram.markup(r),
    });
  }

  /** Reply tugmalarini Telegram formatiga keltiradi */
  static markup(r: Reply) {
    if (r.copy) return { inline_keyboard: [[{ text: r.copy.label, copy_text: { text: r.copy.text } }]] };
    return r.keyboard
      ? { keyboard: r.keyboard, resize_keyboard: true, is_persistent: true }
      : { remove_keyboard: true };
  }

  /** Rasm (file_id yoki URL) + izoh. Natijada yuborilgan rasmning file_id si qaytadi. */
  async sendPhoto(chatId: number, photo: string, caption: string, reply_markup?: unknown): Promise<string | undefined> {
    const res = await this.call<{ photo?: { file_id: string }[] }>("sendPhoto", {
      chat_id: chatId,
      photo,
      caption,
      parse_mode: "HTML",
      ...(reply_markup ? { reply_markup } : {}),
    });
    return res.photo?.at(-1)?.file_id;
  }

  sendDocument(chatId: number, bytes: Uint8Array, filename: string, mime: string) {
    const fd = new FormData();
    fd.append("chat_id", String(chatId));
    fd.append("document", new Blob([bytes], { type: mime }), filename);
    return this.call("sendDocument", fd);
  }

  chatAction(chatId: number, action: string) {
    return this.call("sendChatAction", { chat_id: chatId, action }).catch(() => {});
  }

  async download(fileId: string): Promise<Uint8Array> {
    const f = await this.call<{ file_path: string }>("getFile", { file_id: fileId });
    const res = await fetch(`${this.api}/file/bot${this.token}/${f.file_path}`);
    if (!res.ok) throw new Error(`Faylni yuklab bo'lmadi: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}
