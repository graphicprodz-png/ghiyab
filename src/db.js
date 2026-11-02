// قاعدة البيانات: SQLite المدمجة في Node.js (بدون أي مكتبة خارجية)
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'ghiyab.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pass TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','supervisor'))
);
CREATE TABLE IF NOT EXISTS tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  parent TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  teacher TEXT NOT NULL,
  date TEXT NOT NULL,
  time_from TEXT NOT NULL,
  time_to TEXT NOT NULL,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS absences (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  notify_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',   -- waiting | sending | sent | failed
  channel TEXT,
  sent_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  UNIQUE (session_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_abs_status ON absences(status, notify_at);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

const DEFAULT_CONFIG = {
  school: 'ثانوية النموذجية',
  delayMin: 15,
  cc: '213',
  template:
    'السلام عليكم ورحمة الله،\nنعلم وليّ التلميذ(ة) {الاسم} (رقم {الرقم}، قسم {القسم}) أن ابنكم/ابنتكم غائب(ة) عن حصة {المادة} مع الأستاذ(ة) {الأستاذ} يوم {التاريخ} من الساعة {من} إلى الساعة {إلى}.\nإدارة {المؤسسة}',
};

function getConfig() {
  const rows = db.prepare('SELECT key, value FROM config').all();
  const cfg = { ...DEFAULT_CONFIG };
  for (const r of rows) {
    try { cfg[r.key] = JSON.parse(r.value); } catch { cfg[r.key] = r.value; }
  }
  return cfg;
}
function setConfig(obj) {
  const st = db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const k of Object.keys(DEFAULT_CONFIG)) {
    if (obj[k] !== undefined) st.run(k, JSON.stringify(obj[k]));
  }
  return getConfig();
}

// كلمات المرور: scrypt مع ملح عشوائي
function hashPass(p) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(p), salt, 64).toString('hex');
}
function checkPass(p, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const h = crypto.scryptSync(String(p), salt, 64);
  return crypto.timingSafeEqual(h, Buffer.from(hash, 'hex'));
}

const uid = () => crypto.randomBytes(9).toString('base64url');

// أول تشغيل: إنشاء حساب المدير
function ensureAdmin() {
  const n = db.prepare('SELECT COUNT(*) n FROM users').get().n;
  if (n > 0) return null;
  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASS || crypto.randomBytes(6).toString('base64url');
  db.prepare('INSERT INTO users (id, username, name, pass, role) VALUES (?,?,?,?,?)')
    .run(uid(), username, 'المدير', hashPass(password), 'admin');
  return { username, password, generated: !process.env.ADMIN_PASS };
}

module.exports = { db, getConfig, setConfig, hashPass, checkPass, uid, ensureAdmin, DEFAULT_CONFIG };
