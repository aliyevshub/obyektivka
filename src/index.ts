// Cloudflare Worker: Telegram webhook'ini qabul qiladi.
import regularFont from "../fonts/LiberationSerif-Regular.ttf";
import boldFont from "../fonts/LiberationSerif-Bold.ttf";
import sampleJpg from "../assets/namuna-3x4.jpg";
import {
  handle, localize, escapeHtml, approvedText, rejectedText, deliveredText, PRICE,
  type Incoming, type Session, type Reply,
} from "./bot";
import { Telegram } from "./telegram";
import { buildDoc } from "./layout";
import { buildDocx } from "./docx";
import { buildPdf } from "./pdf";
import { readPhoto } from "./image";

export interface Env {
  BOT_TOKEN: string;
  DB: D1Database;
  /** Cheklarni tekshirish uchun Workers AI */
  AI?: Ai;
  /** Administratorning Telegram ID raqami (wrangler.toml) */
  ADMIN_ID: string;
  /** To'lov kartasi (GitHub Secrets orqali) */
  CARD_NUMBER?: string;
  CARD_OWNER?: string;
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

// ---------- Ma'lumotlar bazasi ----------

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
async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}
async function setSetting(db: D1Database, key: string, value: string) {
  await db.prepare("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2").bind(key, value).run();
}

// ---------- Telegram turlari ----------

interface TgUser { id: number; first_name?: string; last_name?: string; username?: string }
interface TgPhotoSize { file_id: string; width: number; height: number }
interface TgMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: TgUser;
  text?: string;
  photo?: TgPhotoSize[];
  document?: { file_id: string; mime_type?: string };
  caption?: string;
}
interface TgCallback { id: string; from: TgUser; data?: string; message?: TgMessage }

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

const userLabel = (u?: TgUser) =>
  u ? escapeHtml(`${u.first_name ?? ""} ${u.last_name ?? ""}`.trim()) + (u.username ? ` (@${u.username})` : "") + ` — ID <code>${u.id}</code>` : "—";

// ---------- Chekni tekshirish (Workers AI) ----------

const RECEIPT_PROMPT =
  "Look at this image. Is it a payment receipt, a bank transfer confirmation, or a screenshot of a banking / " +
  "payment app (for example Click, Payme, Uzum, a bank app) that shows an amount, card number or transaction numbers? " +
  "Answer with only one word: YES or NO.";

/** Rasm chekka o'xshaydimi. AI ishlamasa — qabul qilamiz (baribir administrator tekshiradi). */
async function looksLikeReceipt(env: Env, tg: Telegram, m: TgMessage): Promise<boolean> {
  if (!env.AI) return true;
  try {
    // AI uchun o'rtacha o'lchamdagi nusxani olamiz
    const sizes = m.photo ?? [];
    const pick = sizes.filter((p) => p.width <= 1280).at(-1) ?? sizes[0];
    const fileId = pick?.file_id ?? m.document?.file_id;
    if (!fileId) return true;
    const bytes = await tg.download(fileId);
    const out = (await env.AI.run("@cf/llava-hf/llava-1.5-7b-hf" as keyof AiModels, {
      image: [...bytes],
      prompt: RECEIPT_PROMPT,
      max_tokens: 5,
    } as never)) as { description?: string; response?: string };
    const answer = (out.description ?? out.response ?? "").trim().toUpperCase();
    console.log("receipt check:", answer);
    if (!answer) return true;
    return !answer.startsWith("NO");
  } catch (e) {
    console.error("AI tekshiruvi ishlamadi:", e);
    return true;
  }
}

// ---------- Javoblarni yuborish ----------

async function sendReplies(env: Env, tg: Telegram, chatId: number, replies: Reply[], origin: string) {
  for (const r of replies) {
    if (r.samplePhoto) {
      const cached = await getSetting(env.DB, "sample_file_id");
      try {
        const id = await tg.sendPhoto(chatId, cached ?? `${origin}/namuna-3x4.jpg`, r.text, Telegram.markup(r));
        if (!cached && id) await setSetting(env.DB, "sample_file_id", id);
        continue;
      } catch (e) {
        console.error("Namuna rasm yuborilmadi:", e);
        if (cached) await env.DB.prepare("DELETE FROM settings WHERE key = 'sample_file_id'").run();
      }
    }
    await tg.send(chatId, r);
  }
}

/** Word va PDF tayyorlab yuboradi */
async function deliver(env: Env, tg: Telegram, chatId: number, s: Session) {
  await tg.chatAction(chatId, "upload_document");
  let photo;
  if (s.photo) {
    try { photo = readPhoto(await tg.download(s.photo)) ?? undefined; } catch (e) { console.error(e); }
  }
  const doc = buildDoc({ script: s.script, data: s.data, work: s.work, relatives: s.relatives, photo });
  await tg.sendDocument(chatId, buildDocx(doc, photo), fileName(doc.fio, "docx"),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  try {
    const bytes = await buildPdf(doc, { regular: regularFont, bold: boldFont }, photo);
    await tg.sendDocument(chatId, bytes, fileName(doc.fio, "pdf"), "application/pdf");
  } catch (e) {
    console.error("PDF yaratilmadi:", e);
  }
  await tg.send(chatId, { text: deliveredText(s.script) });
}

// ---------- Administrator ----------

function isAdmin(env: Env, id?: number) {
  return !!id && String(id) === String(env.ADMIN_ID).trim();
}

async function adminCommand(env: Env, tg: Telegram, m: TgMessage): Promise<boolean> {
  const text = (m.text ?? "").trim();
  if (!isAdmin(env, m.from?.id) || !/^\/kod\b/i.test(text)) return false;
  const arg = text.replace(/^\/kod\S*\s*/i, "").trim();
  if (arg) {
    if (!/^[\p{L}\p{N}_-]{2,40}$/u.test(arg)) {
      await tg.send(m.chat.id, { text: "❌ Promokod faqat harf, raqam, _ va - belgilaridan iborat bo'lsin (2–40 belgi)." });
      return true;
    }
    await setSetting(env.DB, "promo_code", arg);
    await setSetting(env.DB, "promo_uses", "0");
    await tg.send(m.chat.id, { text: `✅ Yangi promokod o'rnatildi: <code>${escapeHtml(arg)}</code>\nEski promokod bekor qilindi.` });
  } else {
    const code = await getSetting(env.DB, "promo_code");
    const uses = (await getSetting(env.DB, "promo_uses")) ?? "0";
    await tg.send(m.chat.id, {
      text: code
        ? `🎟 Amaldagi promokod: <code>${escapeHtml(code)}</code>\nIshlatilgan: <b>${uses}</b> marta\n\nYangi kod: <code>/kod YANGIKOD</code>`
        : "Promokod hali o'rnatilmagan.\nO'rnatish: <code>/kod YANGIKOD</code>",
    });
  }
  return true;
}

async function onCallback(env: Env, tg: Telegram, cb: TgCallback) {
  const answer = (text: string) => tg.call("answerCallbackQuery", { callback_query_id: cb.id, text }).catch(() => {});
  if (!isAdmin(env, cb.from.id)) return answer("Ruxsat yo'q");
  const m = /^(ok|no):(\d+)$/.exec(cb.data ?? "");
  if (!m) return answer("");
  const [, action, idStr] = m;
  const order = await env.DB.prepare("SELECT chat_id, data, status FROM orders WHERE id = ?").bind(+idStr).first<{
    chat_id: number; data: string; status: string;
  }>();
  if (!order) return answer("Buyurtma topilmadi");
  if (order.status !== "pending") return answer("Bu buyurtma allaqachon ko'rib chiqilgan");

  const s = JSON.parse(order.data) as Session;
  const status = action === "ok" ? "approved" : "rejected";
  await env.DB.prepare("UPDATE orders SET status = ? WHERE id = ?").bind(status, +idStr).run();
  if (cb.message) {
    const mark = action === "ok" ? "✅ TASDIQLANDI" : "❌ RAD ETILDI";
    await tg.call("editMessageCaption", {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      caption: `${cb.message.caption ?? ""}\n\n${mark}`,
      reply_markup: { inline_keyboard: [] },
    }).catch((e) => console.error(e));
  }
  await answer(action === "ok" ? "Tasdiqlandi, hujjat yuborilmoqda" : "Rad etildi");

  const current = await load(env.DB, "sessions", order.chat_id);
  if (action === "ok") {
    if (current?.step === "waiting") await save(env.DB, "sessions", order.chat_id, { ...current, step: "done" });
    await save(env.DB, "profiles", order.chat_id, s);
    await tg.send(order.chat_id, { text: approvedText(s.script) });
    await deliver(env, tg, order.chat_id, s);
  } else {
    if (current?.step === "waiting") await save(env.DB, "sessions", order.chat_id, { ...current, step: "pay" });
    await tg.send(order.chat_id, { text: rejectedText(s.script) });
  }
}

// ---------- Foydalanuvchi xabarlari ----------

async function onMessage(env: Env, tg: Telegram, m: TgMessage, origin: string) {
  if (m.chat.type !== "private") return;
  if (await adminCommand(env, tg, m)) return;
  const chatId = m.chat.id;
  const incoming = toIncoming(m);
  const prev = await load(env.DB, "sessions", chatId);

  // Saqlangan ma'lumotlar faqat /start da kerak
  const isStart = !prev || /^\/start\b/.test(incoming.text ?? "");
  const saved = isStart ? await load(env.DB, "profiles", chatId) : null;
  const promoCode = prev?.step === "promo" ? await getSetting(env.DB, "promo_code") : null;
  if (prev?.step === "pay" && incoming.photoId) incoming.isReceipt = await looksLikeReceipt(env, tg, m);

  const res = handle(prev, incoming, {
    saved,
    promoCode,
    card: { number: env.CARD_NUMBER, owner: env.CARD_OWNER },
  });
  await save(env.DB, "sessions", chatId, res.session);
  if (res.deleteProfile) await save(env.DB, "profiles", chatId, null);
  await sendReplies(env, tg, chatId, res.replies, origin);
  const s = res.session;
  if (!s) return;

  // Chek yuborildi: buyurtma yaratib, administratorga yuboramiz
  if (res.receipt) {
    const order = await env.DB.prepare("INSERT INTO orders (chat_id, data, status, created_at) VALUES (?, ?, 'pending', ?) RETURNING id")
      .bind(chatId, JSON.stringify(s), Date.now())
      .first<{ id: number }>();
    const caption =
      `🧾 <b>Yangi to'lov cheki</b> — buyurtma #${order!.id}\n\n` +
      `<b>F.I.O.:</b> ${escapeHtml(s.data.fio ?? "—")}\n` +
      `<b>Foydalanuvchi:</b> ${userLabel(m.from)}\n` +
      `<b>Summa:</b> ${PRICE}`;
    await tg.sendPhoto(Number(env.ADMIN_ID), res.receipt, caption, {
      inline_keyboard: [[
        { text: "✅ Tasdiqlash", callback_data: `ok:${order!.id}` },
        { text: "❌ Rad etish", callback_data: `no:${order!.id}` },
      ]],
    });
    return;
  }

  // Promokod bilan bepul
  if (res.generate) {
    await save(env.DB, "profiles", chatId, s);
    if (res.promoUsed) {
      const uses = Number((await getSetting(env.DB, "promo_uses")) ?? "0") + 1;
      await setSetting(env.DB, "promo_uses", String(uses));
      await tg.send(Number(env.ADMIN_ID), {
        text:
          `🎟 <b>Promokod ishlatildi:</b> <code>${escapeHtml(res.promoUsed)}</code>\n\n` +
          `<b>F.I.O.:</b> ${escapeHtml(s.data.fio ?? "—")}\n` +
          `<b>Foydalanuvchi:</b> ${userLabel(m.from)}\n` +
          `<b>Jami:</b> ${uses} marta`,
      }).catch((e) => console.error(e));
    }
    await deliver(env, tg, chatId, s);
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const tg = new Telegram(env.BOT_TOKEN, env.TELEGRAM_API || undefined);
    const secret = await webhookSecret(env.BOT_TOKEN);

    if (req.method === "POST" && url.pathname === "/webhook") {
      if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) return new Response("forbidden", { status: 403 });
      const update = (await req.json()) as { message?: TgMessage; callback_query?: TgCallback };
      try {
        if (update.message) await onMessage(env, tg, update.message, url.origin);
        else if (update.callback_query) await onCallback(env, tg, update.callback_query);
      } catch (e) {
        console.error(e);
        const chatId = update.message?.chat.id ?? update.callback_query?.from.id;
        if (chatId) {
          await tg.send(chatId, { text: localize("Kechirasiz, xatolik yuz berdi 😔 Qaytadan urinib ko'ring yoki /start bosing.", "lat") }).catch(() => {});
        }
      }
      // Telegram qayta yubormasligi uchun har doim 200
      return new Response("ok");
    }

    // Namuna 3×4 rasm (Telegram shu manzildan yuklab oladi)
    if (url.pathname === "/namuna-3x4.jpg") {
      return new Response(sampleJpg, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=86400" } });
    }

    // Botni ulash: deploydan keyin bir marta https://<worker>/setup ni ochish kifoya
    if (url.pathname === "/setup") {
      await tg.call("setWebhook", {
        url: `${url.origin}/webhook`,
        secret_token: secret,
        allowed_updates: ["message", "callback_query"],
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
