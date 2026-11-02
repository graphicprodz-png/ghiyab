// إرسال الإشعارات للأولياء: جدولة + مزوّدو الإرسال (SMS / واتساب)
const { db, getConfig } = require('./db');

const fmtDate = (s) => { const [y, m, d] = String(s).split('-'); return d && m && y ? `${d}/${m}/${y}` : s; };

function intlPhone(p, cc) {
  let d = String(p || '').replace(/[^\d+]/g, '');
  if (!d) return '';
  if (d.startsWith('+')) return d.slice(1);
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('0')) return (cc || '213') + d.slice(1);
  return d;
}

function buildMessage(a, cfg = getConfig()) {
  return String(cfg.template || '')
    .replaceAll('{الاسم}', a.student_name || '')
    .replaceAll('{الرقم}', a.code || '')
    .replaceAll('{القسم}', a.class_name || '')
    .replaceAll('{المادة}', a.subject || '')
    .replaceAll('{الأستاذ}', a.teacher || '')
    .replaceAll('{التاريخ}', fmtDate(a.date))
    .replaceAll('{من}', a.time_from || '')
    .replaceAll('{إلى}', a.time_to || '')
    .replaceAll('{المؤسسة}', cfg.school || '');
}

const ABSENCE_SELECT = `
  SELECT a.*, s.name AS student_name, s.code, s.parent, s.phone, s.class_id,
         c.name AS class_name, se.subject, se.teacher, se.date, se.time_from, se.time_to
  FROM absences a
  JOIN students s ON s.id = a.student_id
  JOIN sessions se ON se.id = a.session_id
  JOIN classes c ON c.id = s.class_id`;

/* ---------------- المزوّدون ---------------- */
const env = (k) => process.env[k] || '';

async function postForm(url, form, auth) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: auth },
    body: new URLSearchParams(form),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 300)}`);
  return t;
}
async function postJson(url, body, headers = {}) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 300)}`);
  return t;
}

const providers = {
  // Twilio — SMS
  twilio_sms: {
    channel: 'sms',
    ready: () => env('TWILIO_SID') && env('TWILIO_TOKEN') && env('TWILIO_FROM'),
    send: (phone, msg) => postForm(
      `https://api.twilio.com/2010-04-01/Accounts/${env('TWILIO_SID')}/Messages.json`,
      { From: env('TWILIO_FROM'), To: '+' + phone, Body: msg },
      'Basic ' + Buffer.from(env('TWILIO_SID') + ':' + env('TWILIO_TOKEN')).toString('base64')),
  },
  // Twilio — WhatsApp
  twilio_whatsapp: {
    channel: 'whatsapp',
    ready: () => env('TWILIO_SID') && env('TWILIO_TOKEN') && env('TWILIO_WHATSAPP_FROM'),
    send: (phone, msg) => postForm(
      `https://api.twilio.com/2010-04-01/Accounts/${env('TWILIO_SID')}/Messages.json`,
      { From: 'whatsapp:' + env('TWILIO_WHATSAPP_FROM'), To: 'whatsapp:+' + phone, Body: msg },
      'Basic ' + Buffer.from(env('TWILIO_SID') + ':' + env('TWILIO_TOKEN')).toString('base64')),
  },
  // WhatsApp Cloud API من Meta — يتطلب قالب رسالة معتمداً بمتغير واحد {{1}}
  whatsapp_cloud: {
    channel: 'whatsapp',
    ready: () => env('WA_TOKEN') && env('WA_PHONE_ID') && env('WA_TEMPLATE'),
    send: (phone, msg) => postJson(
      `https://graph.facebook.com/${env('WA_API_VERSION') || 'v21.0'}/${env('WA_PHONE_ID')}/messages`,
      {
        messaging_product: 'whatsapp', to: phone, type: 'template',
        template: {
          name: env('WA_TEMPLATE'), language: { code: env('WA_TEMPLATE_LANG') || 'ar' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: msg.replace(/\s*\n\s*/g, ' — ') }] }],
        },
      },
      { Authorization: 'Bearer ' + env('WA_TOKEN') }),
  },
  // بوابة HTTP عامة (مثلاً تطبيق أندرويد يحوّل هاتفاً بشريحة المؤسسة إلى بوابة SMS)
  http: {
    channel: 'sms',
    ready: () => env('HTTP_URL'),
    send: async (phone, msg) => {
      const fill = (s) => String(s)
        .replaceAll('{phone}', phone).replaceAll('{phone_plus}', '+' + phone)
        .replaceAll('{message}', JSON.stringify(msg).slice(1, -1));
      const body = fill(env('HTTP_BODY') || '{"phoneNumbers":["{phone_plus}"],"message":"{message}"}');
      const headers = { 'Content-Type': 'application/json' };
      if (env('HTTP_AUTH')) headers.Authorization = env('HTTP_AUTH');
      const r = await fetch(env('HTTP_URL'), { method: 'POST', headers, body });
      const t = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 300)}`);
      return t;
    },
  },
};

function providerList() {
  return String(env('NOTIFY_PROVIDER') || 'manual').split(',').map((s) => s.trim()).filter((p) => p && p !== 'manual');
}
function providerInfo() {
  const list = providerList();
  return {
    auto: list.length > 0,
    providers: list.map((p) => ({ name: p, ready: !!(providers[p] && providers[p].ready()) })),
  };
}

/* ---------------- الإرسال ---------------- */
const MAX_ATTEMPTS = 3;

async function sendOne(a, cfg) {
  const phone = intlPhone(a.phone, cfg.cc);
  if (!phone) { const e = new Error('لا يوجد رقم هاتف للولي'); e.permanent = true; throw e; }
  const msg = buildMessage(a, cfg);
  let lastErr;
  // يجرّب المزوّدين بالترتيب (مثلاً واتساب ثم SMS احتياطياً)
  for (const name of providerList()) {
    const p = providers[name];
    if (!p) { lastErr = new Error('مزوّد غير معروف: ' + name); continue; }
    if (!p.ready()) { lastErr = new Error('إعدادات المزوّد ناقصة: ' + name); continue; }
    try { await p.send(phone, msg); return p.channel; } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('لا يوجد مزوّد إرسال');
}

let running = false;
async function tick() {
  if (running || !providerList().length) return;
  running = true;
  try {
    const cfg = getConfig();
    const due = db.prepare(`${ABSENCE_SELECT} WHERE a.status = 'waiting' AND a.notify_at <= ? AND a.attempts < ? ORDER BY a.notify_at LIMIT 50`)
      .all(Date.now(), MAX_ATTEMPTS);
    for (const a of due) {
      // حجز السجل حتى لا يُرسل مرتين
      const claimed = db.prepare(`UPDATE absences SET status='sending' WHERE id=? AND status='waiting'`).run(a.id).changes;
      if (!claimed) continue;
      try {
        const channel = await sendOne(a, cfg);
        db.prepare(`UPDATE absences SET status='sent', channel=?, sent_at=?, attempts=attempts+1, last_error=NULL WHERE id=?`)
          .run(channel, Date.now(), a.id);
        console.log(`[إرسال] ✓ ${a.student_name} — ${a.subject}`);
      } catch (e) {
        const attempts = e.permanent ? MAX_ATTEMPTS : a.attempts + 1;
        // إعادة المحاولة بعد دقيقتين، ثم فشل نهائي بعد 3 محاولات
        db.prepare(`UPDATE absences SET status=?, attempts=?, last_error=?, notify_at=? WHERE id=?`)
          .run(attempts >= MAX_ATTEMPTS ? 'failed' : 'waiting', attempts, String(e.message || e).slice(0, 400), Date.now() + 120000, a.id);
        console.warn(`[إرسال] ✗ ${a.student_name}: ${e.message}`);
      }
    }
  } finally { running = false; }
}

function startScheduler() {
  // أي سجل بقي في حالة "sending" بعد إعادة تشغيل الخادم يعود للانتظار
  db.prepare(`UPDATE absences SET status='waiting' WHERE status='sending'`).run();
  setInterval(() => tick().catch((e) => console.error(e)), 30000);
  setTimeout(() => tick().catch((e) => console.error(e)), 3000);
}

module.exports = { startScheduler, tick, buildMessage, intlPhone, providerInfo, ABSENCE_SELECT };
