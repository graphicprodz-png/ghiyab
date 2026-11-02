// خادم تطبيق «غياب» — بدون مكتبات خارجية (Node.js 22.13 أو أحدث)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, getConfig, setConfig, hashPass, checkPass, uid, ensureAdmin } = require('./db');
const { startScheduler, buildMessage, intlPhone, providerInfo, ABSENCE_SELECT } = require('./notify');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');
const SECURE_COOKIE = process.env.COOKIE_SECURE === '1';

/* ---------------- أدوات ---------------- */
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (msg) => { throw new HttpError(400, msg); };
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s) => /^\d{2}:\d{2}$/.test(s);

function send(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 2e6) { reject(new HttpError(413, 'الطلب كبير جداً')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'JSON غير صالح')); }
    });
    req.on('error', reject);
  });
}
function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function currentUser(req) {
  const t = cookies(req).sid; if (!t) return null;
  return db.prepare('SELECT u.id, u.username, u.name, u.role FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ? AND t.created_at > ?')
    .get(t, Date.now() - 30 * 86400000) || null;
}
function nextCode(n = 1) {
  const yy = String(new Date().getFullYear()).slice(2);
  const row = db.prepare(`SELECT MAX(CAST(SUBSTR(code, 3) AS INTEGER)) m FROM students WHERE code LIKE ?`).get(yy + '%');
  const start = (row.m || 0) + 1;
  return Array.from({ length: n }, (_, i) => yy + String(start + i).padStart(4, '0'));
}

/* ---------------- محاولات الدخول ---------------- */
const loginFails = new Map();
function loginAllowed(ip) {
  const e = loginFails.get(ip); if (!e) return true;
  if (Date.now() - e.t > 15 * 60000) { loginFails.delete(ip); return true; }
  return e.n < 10;
}

/* ---------------- المسارات ---------------- */
const routes = [];
const route = (method, pattern, role, fn) => {
  const keys = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, role, fn });
};

route('POST', '/api/login', null, async ({ body, req }) => {
  const ip = req.socket.remoteAddress;
  if (!loginAllowed(ip)) throw new HttpError(429, 'محاولات كثيرة، أعد المحاولة بعد 15 دقيقة');
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(str(body.username, 60));
  if (!u || !checkPass(body.password, u.pass)) {
    const e = loginFails.get(ip) || { n: 0, t: Date.now() }; e.n++; loginFails.set(ip, e);
    throw new HttpError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
  }
  loginFails.delete(ip);
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO tokens (token, user_id, created_at) VALUES (?,?,?)').run(token, u.id, Date.now());
  const cookie = `sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${30 * 86400}${SECURE_COOKIE ? '; Secure' : ''}`;
  return { __headers: { 'Set-Cookie': cookie }, ok: true };
});

route('POST', '/api/logout', 'any', ({ req }) => {
  db.prepare('DELETE FROM tokens WHERE token = ?').run(cookies(req).sid || '');
  return { __headers: { 'Set-Cookie': 'sid=; Path=/; Max-Age=0' }, ok: true };
});

route('GET', '/api/state', 'any', ({ user, query }) => {
  const date = isDate(query.get('date')) ? query.get('date') : new Date().toISOString().slice(0, 10);
  const cfg = getConfig();
  const absences = db.prepare(`${ABSENCE_SELECT} WHERE se.date = ? ORDER BY a.notify_at`).all(date)
    .map((a) => ({ ...a, message: buildMessage(a, cfg), intl: intlPhone(a.phone, cfg.cc) }));
  return {
    me: user,
    cfg,
    provider: providerInfo(),
    now: Date.now(),
    classes: db.prepare('SELECT * FROM classes ORDER BY name').all(),
    students: db.prepare('SELECT * FROM students ORDER BY name').all(),
    sessions: db.prepare(`SELECT se.*, c.name AS class_name, (SELECT COUNT(*) FROM absences a WHERE a.session_id = se.id) AS n_abs
                          FROM sessions se JOIN classes c ON c.id = se.class_id WHERE se.date = ? ORDER BY se.time_from DESC`).all(date),
    absences,
    users: user.role === 'admin' ? db.prepare('SELECT id, username, name, role FROM users ORDER BY role, name').all() : [],
  };
});

/* --- الأقسام والتلاميذ (المدير) --- */
route('POST', '/api/classes', 'admin', ({ body }) => {
  const level = str(body.level, 40) || bad('المستوى مطلوب');
  const id = uid();
  db.prepare('INSERT INTO classes (id, level, name) VALUES (?,?,?)').run(id, level, str(body.name, 100) || level);
  return { id };
});
route('DELETE', '/api/classes/:id', 'admin', ({ params }) => {
  db.prepare('DELETE FROM classes WHERE id = ?').run(params.id); return { ok: true };
});
route('POST', '/api/students', 'admin', ({ body }) => {
  const rows = Array.isArray(body.rows) ? body.rows : [body];
  const classId = str(body.classId, 40);
  if (!db.prepare('SELECT 1 FROM classes WHERE id = ?').get(classId)) bad('القسم غير موجود');
  const clean = rows.map((r) => ({ name: str(r.name, 100), parent: str(r.parent, 100), phone: str(r.phone, 30) })).filter((r) => r.name);
  if (!clean.length) bad('اسم التلميذ مطلوب');
  if (clean.length > 500) bad('500 تلميذ كحد أقصى في المرة الواحدة');
  const codes = nextCode(clean.length);
  const st = db.prepare('INSERT INTO students (id, code, name, parent, phone, class_id) VALUES (?,?,?,?,?,?)');
  db.exec('BEGIN');
  try { clean.forEach((r, i) => st.run(uid(), codes[i], r.name, r.parent, r.phone, classId)); db.exec('COMMIT'); }
  catch (e) { db.exec('ROLLBACK'); throw e; }
  return { added: clean.length };
});
route('PUT', '/api/students/:id', 'admin', ({ params, body }) => {
  const s = db.prepare('SELECT * FROM students WHERE id = ?').get(params.id) || bad('التلميذ غير موجود');
  db.prepare('UPDATE students SET name=?, parent=?, phone=?, class_id=? WHERE id=?')
    .run(str(body.name, 100) || s.name, str(body.parent ?? s.parent, 100), str(body.phone ?? s.phone, 30), str(body.classId, 40) || s.class_id, s.id);
  return { ok: true };
});
route('DELETE', '/api/students/:id', 'admin', ({ params }) => {
  db.prepare('DELETE FROM students WHERE id = ?').run(params.id); return { ok: true };
});

/* --- الحصص والغياب (المشرف والمدير) --- */
route('POST', '/api/sessions', 'any', ({ body, user }) => {
  const classId = str(body.classId, 40);
  if (!db.prepare('SELECT 1 FROM classes WHERE id = ?').get(classId)) bad('القسم غير موجود');
  const subject = str(body.subject, 60) || bad('المادة مطلوبة');
  const teacher = str(body.teacher, 80) || bad('اسم الأستاذ مطلوب');
  if (!isDate(body.date) || !isTime(body.from) || !isTime(body.to)) bad('التاريخ أو التوقيت غير صالح');
  const id = uid();
  db.prepare('INSERT INTO sessions (id, class_id, subject, teacher, date, time_from, time_to, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, classId, subject, teacher, body.date, body.from, body.to, user.id, Date.now());
  return { id };
});

function addAbsence(sessionId, student) {
  const se = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) || bad('الحصة غير موجودة');
  if (student.class_id !== se.class_id) bad(`${student.name} ليس من هذا القسم`);
  const ex = db.prepare('SELECT id FROM absences WHERE session_id = ? AND student_id = ?').get(se.id, student.id);
  if (ex) return { id: ex.id, already: true, name: student.name };
  const now = Date.now(); const delay = Math.max(0, Number(getConfig().delayMin) || 0) * 60000;
  const id = uid();
  db.prepare('INSERT INTO absences (id, session_id, student_id, created_at, notify_at) VALUES (?,?,?,?,?)').run(id, se.id, student.id, now, now + delay);
  return { id, name: student.name };
}
route('POST', '/api/absences', 'any', ({ body }) => {
  const s = db.prepare('SELECT * FROM students WHERE id = ?').get(str(body.studentId, 40)) || bad('التلميذ غير موجود');
  return addAbsence(str(body.sessionId, 40), s);
});
route('POST', '/api/scan', 'any', ({ body }) => {
  const code = str(body.code, 40).replace(/\*/g, '');
  const s = db.prepare('SELECT * FROM students WHERE code = ?').get(code) || bad(`الرقم ${code} غير موجود`);
  return addAbsence(str(body.sessionId, 40), s);
});
route('DELETE', '/api/absences/:id', 'any', ({ params }) => {
  const a = db.prepare('SELECT * FROM absences WHERE id = ?').get(params.id) || bad('غير موجود');
  if (a.status === 'sent' || a.status === 'sending') bad('أُرسل الإشعار للولي، لا يمكن إلغاء هذا الغياب');
  db.prepare('DELETE FROM absences WHERE id = ?').run(a.id); return { ok: true };
});
route('POST', '/api/absences/:id/now', 'any', ({ params }) => {
  db.prepare(`UPDATE absences SET notify_at = ?, status = CASE WHEN status='failed' THEN 'waiting' ELSE status END, attempts = CASE WHEN status='failed' THEN 0 ELSE attempts END WHERE id = ? AND status IN ('waiting','failed')`)
    .run(Date.now(), params.id);
  return { ok: true };
});
route('POST', '/api/absences/:id/sent', 'any', ({ params, body }) => {
  const ch = ['whatsapp', 'sms', 'manual'].includes(body.channel) ? body.channel : 'manual';
  db.prepare(`UPDATE absences SET status='sent', channel=?, sent_at=? WHERE id = ? AND status IN ('waiting','failed')`).run(ch, Date.now(), params.id);
  return { ok: true };
});

/* --- الإعدادات والمستخدمون (المدير) --- */
route('PUT', '/api/config', 'admin', ({ body }) => {
  const c = {};
  if (body.school !== undefined) c.school = str(body.school, 120);
  if (body.delayMin !== undefined) c.delayMin = Math.min(24 * 60, Math.max(0, Number(body.delayMin) || 0));
  if (body.cc !== undefined) c.cc = String(body.cc).replace(/\D/g, '').slice(0, 4) || '213';
  if (body.template !== undefined) c.template = str(body.template, 1000);
  return setConfig(c);
});
route('POST', '/api/users', 'admin', ({ body }) => {
  const username = str(body.username, 40).toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) bad('اسم المستخدم: 3 أحرف لاتينية أو أرقام على الأقل');
  if (String(body.password || '').length < 6) bad('كلمة المرور 6 أحرف على الأقل');
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) bad('اسم المستخدم مستعمل');
  const role = body.role === 'admin' ? 'admin' : 'supervisor';
  db.prepare('INSERT INTO users (id, username, name, pass, role) VALUES (?,?,?,?,?)').run(uid(), username, str(body.name, 80) || username, hashPass(body.password), role);
  return { ok: true };
});
route('DELETE', '/api/users/:id', 'admin', ({ params, user }) => {
  if (params.id === user.id) bad('لا يمكنك حذف حسابك');
  db.prepare('DELETE FROM users WHERE id = ?').run(params.id); return { ok: true };
});
route('PUT', '/api/me/password', 'any', ({ body, user }) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  if (!checkPass(body.current, u.pass)) bad('كلمة المرور الحالية غير صحيحة');
  if (String(body.password || '').length < 6) bad('كلمة المرور الجديدة 6 أحرف على الأقل');
  db.prepare('UPDATE users SET pass = ? WHERE id = ?').run(hashPass(body.password), u.id);
  return { ok: true };
});

/* --- بيانات تجريبية --- */
route('POST', '/api/demo', 'admin', () => {
  const names = ['عبد الله سلطان', 'سلمى محمدي', 'أمين بن علي', 'ياسمين قاسمي', 'محمد الأمين زروقي', 'إيمان بوزيد', 'يوسف حمادي', 'رانية بلقاسم', 'أيوب مرابط', 'هاجر سعيدي', 'إسحاق بن يحيى', 'مريم عيساوي', 'وليد شريف', 'نور الهدى خالدي', 'أنس بوعزة', 'آية فرحات', 'رياض منصوري', 'خديجة بن سالم', 'زكرياء حداد', 'سارة لعمامري', 'إلياس بوشامة', 'شيماء قويدر', 'عماد طالبي', 'لينة بن عمر', 'حمزة رحماني'];
  const cid = uid();
  db.prepare('INSERT INTO classes (id, level, name) VALUES (?,?,?)').run(cid, '2 ثانوي', '2 ثانوي — علوم تجريبية 1');
  const codes = nextCode(names.length);
  const st = db.prepare('INSERT INTO students (id, code, name, parent, phone, class_id) VALUES (?,?,?,?,?,?)');
  names.forEach((n, i) => st.run(uid(), codes[i], n, 'ولي ' + n.split(' ').slice(-1)[0], '', cid));
  return { classId: cid };
});

/* ---------------- الملفات الثابتة ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
function serveStatic(req, res, pathname) {
  let p = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  if (p === '/' || p === '\\') p = '/index.html';
  const file = path.join(PUBLIC, p);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) {
      // تطبيق صفحة واحدة: أي مسار غير معروف يعرض الصفحة الرئيسية
      return fs.readFile(path.join(PUBLIC, 'index.html'), (e2, d2) => { res.writeHead(e2 ? 404 : 200, { 'Content-Type': MIME['.html'] }); res.end(d2 || 'Not found'); });
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

/* ---------------- الخادم ---------------- */
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);
  try {
    // حماية بسيطة من طلبات المواقع الأخرى (CSRF)
    if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'ghiyab') throw new HttpError(403, 'طلب مرفوض');
    const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
    if (!r) throw new HttpError(404, 'غير موجود');
    const m = url.pathname.match(r.re); const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    const user = currentUser(req);
    if (r.role && !user) throw new HttpError(401, 'سجّل الدخول أولاً');
    if (r.role === 'admin' && user.role !== 'admin') throw new HttpError(403, 'هذه العملية خاصة بالإدارة');
    const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : {};
    const out = await r.fn({ req, params, body, user, query: url.searchParams });
    const headers = out && out.__headers; if (headers) delete out.__headers;
    send(res, 200, out, headers);
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    send(res, e.status || 500, { error: e instanceof HttpError ? e.message : 'خطأ في الخادم' });
  }
});

const admin = ensureAdmin();
startScheduler();
server.listen(PORT, () => {
  console.log(`«غياب» يعمل على http://localhost:${PORT}`);
  if (admin) console.log(`\n  حساب المدير الأول:  ${admin.username} / ${admin.password}${admin.generated ? '   (احفظها وغيّرها بعد الدخول)' : ''}\n`);
  const p = providerInfo();
  console.log(p.auto ? `الإرسال الآلي: ${p.providers.map((x) => x.name + (x.ready ? ' ✓' : ' ✗ إعدادات ناقصة')).join('، ')}` : 'الإرسال الآلي غير مفعّل (NOTIFY_PROVIDER=manual) — تُرسل الإشعارات يدوياً من واجهة «الإشعارات».');
});
