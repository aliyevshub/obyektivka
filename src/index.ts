// Cloudflare Worker: Telegram webhook'ini qabul qiladi.
import regularFont from "../fonts/LiberationSerif-Regular.ttf";
import boldFont from "../fonts/LiberationSerif-Bold.ttf";
import { handle, afterSend, type Incoming, type Session } from "./bot";
import { Telegram } from "./telegram";
import { buildDoc } from "./layout";
import { buildDocx } from "./docx";
import { buildPdf } from "./pdf";
import { readPhoto } from "./image";

export interface Env {
  BOT_TOKEN: string;
  DB: D1Database;
  /** Faqat mahalliy sinov uchun: soxta Telegram server manzili */
  TELEGRAM_API?: string;
}

/** Tugallanmagan suhbatlar shuncha kundan keyin o'chiriladi */
const KEEP_DAYS = 7;
/** Saqlangan ma'lumotlar oxirgi foydalanishdan shuncha kun o'tib o'chiriladi */
const PROFILE_DAYS = 180;

async function webhookSecret(token: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("obyektivka:" + token));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 48);
}

type Table = "sessions" | "profiles";

async function load(db: D1Database, table: Table, chatId: number): Promise<Session | null> {
  const row = await db.prepare(`SELECT data FROM ${table} WHERE chat_id = ?`).bind(chatId).first<{ data: string }>();
  return row ? (JSON.parse(row.data) as Session) : null;
}
async function save(db: D1Database, table: Table, chatId: number, s: Session | null) {
  if (!s) return db.prepare(`DELETE FROM ${table} WHERE chat_id = ?`).bind(chatId).run();
  return db
    .prepare(`INSERT INTO ${table} (chat_id, data, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(chat_id) DO UPDATE SET data = ?2, updated_at = ?3`)
    .bind(chatId, JSON.stringify(s), Date.now())
    .run();
}

interface TgMessage {
  chat: { id: number; type: string };
  text?: string;
  photo?: { file_id: string; width: number; height: number }[];
  document?: { file_id: string; mime_type?: string };
}

function toIncoming(m: TgMessage): Incoming {
  if (m.photo?.length) return { photoId: m.photo[m.photo.length - 1].file_id };
  if (m.document) {
    return /^image\/(jpeg|png)$/.test(m.document.mime_type ?? "") ? { photoId: m.document.file_id } : { otherFile: true };
  }
  return { text: m.text };
}

function fileName(fio: string, ext: string): string {
  const clean = fio.replace(/[^\p{L}\p{N}' .-]/gu, "").trim().replace(/\s+/g, " ").slice(0, 60);
  return `${clean || "Obyektivka"}.${ext}`;
}

async function onMessage(env: Env, tg: Telegram, m: TgMessage) {
  if (m.chat.type !== "private") return;
  const chatId = m.chat.id;
  const incoming = toIncoming(m);
  const prev = await load(env.DB, "sessions", chatId);
  // Saqlangan ma'lumotlar faqat /start da kerak
  const isStart = !prev || /^\/start\b/.test(incoming.text ?? "");
  const saved = isStart ? await load(env.DB, "profiles", chatId) : null;
  const res = handle(prev, incoming, saved);
  await save(env.DB, "sessions", chatId, res.session);
  if (res.deleteProfile) await save(env.DB, "profiles", chatId, null);
  for (const r of res.replies) await tg.send(chatId, r);
  if (!res.generate || !res.session) return;

  const s = res.session;
  await save(env.DB, "profiles", chatId, s);
  await tg.chatAction(chatId, "upload_document");
  let photo;
  if (s.photo) {
    try { photo = readPhoto(await tg.download(s.photo)) ?? undefined; } catch (e) { console.error(e); }
  }
  const doc = buildDoc({ script: s.script, data: s.data, work: s.work, relatives: s.relatives, photo });
  for (const fmt of res.generate) {
    if (fmt === "docx") {
      await tg.sendDocument(chatId, buildDocx(doc, photo), fileName(doc.fio, "docx"),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    } else {
      const bytes = await buildPdf(doc, { regular: regularFont, bold: boldFont }, photo);
      await tg.sendDocument(chatId, bytes, fileName(doc.fio, "pdf"), "application/pdf");
    }
  }
  await tg.send(chatId, afterSend(s));
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const tg = new Telegram(env.BOT_TOKEN, env.TELEGRAM_API || undefined);
    const secret = await webhookSecret(env.BOT_TOKEN);

    if (req.method === "POST" && url.pathname === "/webhook") {
      if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) return new Response("forbidden", { status: 403 });
      const update = (await req.json()) as { message?: TgMessage };
      if (update.message) {
        try {
          await onMessage(env, tg, update.message);
        } catch (e) {
          console.error(e);
          await tg.send(update.message.chat.id, { text: "Kechirasiz, xatolik yuz berdi 😔 Qaytadan urinib ko'ring yoki /start bosing." }).catch(() => {});
        }
      }
      // Telegram qayta yubormasligi uchun har doim 200
      return new Response("ok");
    }

    // Botni ulash: deploydan keyin bir marta https://<worker>/setup ni ochish kifoya
    if (url.pathname === "/setup") {
      await tg.call("setWebhook", {
        url: `${url.origin}/webhook`,
        secret_token: secret,
        allowed_updates: ["message"],
        drop_pending_updates: true,
      });
      await tg.call("setMyCommands", {
        commands: [
          { command: "start", description: "Obyektivka tayyorlashni boshlash" },
          { command: "bekor", description: "Joriy to'ldirishni bekor qilish" },
          { command: "ochirish", description: "Saqlangan ma'lumotlarimni o'chirish" },
        ],
      });
      return new Response("Webhook o'rnatildi ✅ Endi botga Telegram'da /start yozing.", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    return new Response("Obyektivka bot ishlayapti.", { headers: { "content-type": "text/plain; charset=utf-8" } });
  },

  // Har kuni eski ma'lumotlarni o'chiradi
  async scheduled(_c: ScheduledController, env: Env) {
    await env.DB.prepare("DELETE FROM sessions WHERE updated_at < ?").bind(Date.now() - KEEP_DAYS * 86400_000).run();
    await env.DB.prepare("DELETE FROM profiles WHERE updated_at < ?").bind(Date.now() - PROFILE_DAYS * 86400_000).run();
  },
} satisfies ExportedHandler<Env>;
