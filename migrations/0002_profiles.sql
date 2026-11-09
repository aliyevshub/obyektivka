-- Hujjat tayyorlagan foydalanuvchilarning oxirgi ma'lumotlari (keyingi safar qayta ishlatish uchun)
CREATE TABLE IF NOT EXISTS profiles (
  chat_id INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS profiles_updated ON profiles (updated_at);
