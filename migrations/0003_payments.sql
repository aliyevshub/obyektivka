-- To'lov buyurtmalari: foydalanuvchi chek yuborganda yaratiladi, administrator tasdiqlaydi
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_chat ON orders (chat_id);

-- Sozlamalar: amaldagi promokod, ishlatilish soni, namuna rasm file_id si
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
