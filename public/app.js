/* واجهة تطبيق «غياب» */
let S = null;            // الحالة القادمة من الخادم
let clockSkew = 0;       // فرق الساعة بين الجهاز والخادم
let view = (location.hash || '').slice(1) || 'session';
let stateDate = todayStr();
let session = lsGet('ghiyab_session');
let selClass = lsGet('ghiyab_selClass');
let labelClass = null, flashMsg = null, busy = false;

/* ---------------- أدوات ---------------- */
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function todayStr() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function nowHM() { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
function addHM(hm, min) { const [h, m] = hm.split(':').map(Number); const t = h * 60 + m + min; return String(Math.floor(t / 60) % 24).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
function fmtDate(s) { const [y, m, d] = String(s).split('-'); return d ? d + '/' + m + '/' + y : s; }
function fmtTime(ms) { return new Date(ms).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' }); }
const now = () => Date.now() + clockSkew;
const $ = (id) => document.getElementById(id);
const val = (id) => ($(id) ? $(id).value.trim() : '');
const isAdmin = () => S && S.me.role === 'admin';
const cls = (id) => S.classes.find((c) => c.id === id);

async function api(method, path, body) {
  const r = await fetch(path, {
    method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ghiyab' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {}; try { data = await r.json(); } catch (e) {}
  if (r.status === 401 && path !== '/api/login') { showLogin(); throw new Error(data.error || 'سجّل الدخول'); }
  if (!r.ok) throw new Error(data.error || 'خطأ ' + r.status);
  return data;
}
async function act(fn, okMsg) {
  if (busy) return; busy = true;
  try { const r = await fn(); if (okMsg) flash(typeof okMsg === 'function' ? okMsg(r) : okMsg); await refresh(true); return r; }
  catch (e) { flash(e.message, true); }
  finally { busy = false; }
}
function flash(msg, err) {
  flashMsg = { msg, err }; render();
  setTimeout(() => { if (flashMsg && flashMsg.msg === msg) { flashMsg = null; render(); } }, 3500);
}
const flashHTML = () => (flashMsg ? `<div class="flash ${flashMsg.err ? 'err' : 'ok'}">${esc(flashMsg.msg)}</div>` : '');

/* ---------------- الدخول ---------------- */
function showLogin() { $('login').classList.remove('hide'); $('app').classList.add('hide'); S = null; }
async function doLogin() {
  $('lErr').classList.add('hide');
  try { await api('POST', '/api/login', { username: val('lUser'), password: $('lPass').value }); $('lPass').value = ''; view = 'session'; flashMsg = null; await refresh(true); }
  catch (e) { $('lErr').textContent = e.message; $('lErr').classList.remove('hide'); }
}
async function doLogout() { try { await api('POST', '/api/logout'); } catch (e) {} showLogin(); }

/* ---------------- المزامنة ---------------- */
async function refresh(force) {
  const t0 = Date.now();
  const data = await api('GET', '/api/state?date=' + encodeURIComponent(stateDate));
  clockSkew = data.now - Math.round((t0 + Date.now()) / 2);
  S = data;
  $('login').classList.add('hide'); $('app').classList.remove('hide');
  const ae = document.activeElement;
  const typing = ae && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ae.tagName) && ae.id !== 'scanInput';
  if (force || (!typing && !$('modal').innerHTML)) render();
}
setInterval(() => { if (S && !document.hidden) refresh(false).catch(() => {}); }, 8000);
function cdText(at) { const left = Math.max(0, Number(at) - now()); return Math.floor(left / 60000) + ':' + String(Math.floor((left % 60000) / 1000)).padStart(2, '0'); }
setInterval(() => { if (S && view === 'notifs') document.querySelectorAll('[data-cd]').forEach((el) => { el.textContent = cdText(el.dataset.cd); }); }, 1000);

/* ---------------- التنقل ---------------- */
const TABS = [
  { v: 'session', t: 'تسجيل الغياب' },
  { v: 'notifs', t: 'الإشعارات' },
  { v: 'students', t: 'الأقسام والتلاميذ', admin: true },
  { v: 'labels', t: 'ملصقات الكودبار', admin: true },
  { v: 'settings', t: 'الإعدادات' },
];
function go(v) { view = v; flashMsg = null; try { history.replaceState(null, '', '#' + v); } catch (e) {} render(); window.scrollTo(0, 0); }
window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (v && v !== view) go(v); });

function render() {
  if (!S) return;
  const tabs = TABS.filter((t) => !t.admin || isAdmin());
  if (!tabs.some((t) => t.v === view)) view = 'session';
  const pending = S.absences.filter((a) => a.status === 'failed' || (!S.provider.auto && a.status === 'waiting' && a.notify_at <= now())).length;
  $('nav').innerHTML = tabs.map((t) => `<button class="${t.v === view ? 'on' : ''}" onclick="go('${t.v}')">${t.t}${t.v === 'notifs' && pending ? ` <span class="badge">${pending}</span>` : ''}</button>`).join('');
  $('schoolTitle').textContent = S.cfg.school || 'غياب';
  $('meBtn').textContent = (S.me.name || S.me.username) + ' · خروج';
  const focusScan = document.activeElement && document.activeElement.id === 'scanInput';
  $('main').innerHTML = ({ session: vSession, notifs: vNotifs, students: vStudents, labels: vLabels, settings: vSettings }[view])();
  if (focusScan && $('scanInput')) $('scanInput').focus();
}

/* ---------------- تسجيل الغياب ---------------- */
function vSession() {
  if (!S.classes.length) {
    return `<div class="card empty"><div style="font-size:34px">🏫</div><p>لا توجد أقسام بعد.</p>
      ${isAdmin() ? `<div class="row" style="justify-content:center;max-width:420px;margin:auto">
        <button class="btn" onclick="act(()=>api('POST','/api/demo'),'أُضيف قسم تجريبي بـ 25 تلميذاً')">إضافة قسم تجريبي (25 تلميذاً)</button>
        <button class="btn ghost" onclick="go('students')">إضافة الأقسام</button></div>` : '<p>تُضاف الأقسام من حساب الإدارة.</p>'}</div>`;
  }
  if (session && session.date !== stateDate) { stateDate = session.date; refresh(true); }
  if (!session) {
    const t = nowHM();
    return `<div class="card"><h2>بدء حصة جديدة</h2>
      <label class="f">القسم<select id="sClass">${S.classes.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
      <div class="row">
        <label class="f">المادة<input id="sSubject" placeholder="مثال: الرياضيات" list="subjects"></label>
        <label class="f">الأستاذ(ة)<input id="sTeacher" placeholder="مثال: محمد بوعلام"></label>
      </div>
      <datalist id="subjects">${['الرياضيات', 'اللغة العربية', 'الفيزياء', 'العلوم الطبيعية', 'اللغة الفرنسية', 'اللغة الإنجليزية', 'التاريخ والجغرافيا', 'الفلسفة', 'التربية الإسلامية', 'الإعلام الآلي', 'التربية البدنية'].map((s) => `<option value="${s}">`).join('')}</datalist>
      <div class="row">
        <label class="f">التاريخ<input type="date" id="sDate" value="${todayStr()}"></label>
        <label class="f">من الساعة<input type="time" id="sFrom" value="${t}"></label>
        <label class="f">إلى الساعة<input type="time" id="sTo" value="${addHM(t, 60)}"></label>
      </div>
      ${flashHTML()}
      <button class="btn" onclick="startSession()" style="width:100%;margin-top:4px">بدء تسجيل الغياب</button>
    </div>${sessionsToday()}`;
  }
  const c = cls(session.class_id);
  const list = S.students.filter((s) => s.class_id === session.class_id);
  const absMap = {}; S.absences.filter((a) => a.session_id === session.id).forEach((a) => { absMap[a.student_id] = a; });
  const nAbs = Object.keys(absMap).length;
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap">
      <div><h2 style="margin:0">${esc(session.subject)} — ${esc(c ? c.name : '')}</h2>
      <div class="muted">الأستاذ(ة) ${esc(session.teacher)} · ${fmtDate(session.date)} · من ${session.time_from} إلى ${session.time_to}</div></div>
      <button class="btn ghost sm" onclick="endSession()">إنهاء الحصة</button>
    </div></div>
    <div class="stats">
      <div class="stat"><b>${list.length}</b><span>عدد التلاميذ</span></div>
      <div class="stat"><b style="color:var(--brand)">${list.length - nAbs}</b><span>حاضر</span></div>
      <div class="stat"><b style="color:var(--red)">${nAbs}</b><span>غائب</span></div>
    </div>
    <div class="scan">
      <span>🔎</span>
      <input id="scanInput" inputmode="numeric" autocomplete="off" placeholder="امسح الكودبار أو اكتب رقم التلميذ" onkeydown="if(event.key==='Enter'){scanCode(this.value);this.value=''}">
      <label class="btn ghost sm" style="flex:0 0 auto">📷 صورة<input type="file" accept="image/*" capture="environment" class="hide" onchange="scanImage(this)"></label>
    </div>
    ${flashHTML()}
    <p class="muted" style="margin:0 0 8px">اضغط على اسم التلميذ الغائب لتسجيل غيابه، واضغط مرة أخرى لإلغائه قبل إرسال الإشعار.</p>
    ${list.length ? `<div class="grid">${list.map((s) => { const a = absMap[s.id]; const sent = a && (a.status === 'sent' || a.status === 'sending');
      return `<button class="stu ${a ? 'abs' : ''} ${sent ? 'locked' : ''}" onclick="toggleAbs('${s.id}')">
        <span class="n">${esc(s.name)}</span><span class="c">${esc(s.code)}</span>
        ${a ? `<span class="tag ${sent ? 'ok' : 'red'}">${sent ? 'غائب · أُعلم الولي' : 'غائب'}</span>` : ''}</button>`; }).join('')}</div>`
      : '<div class="empty">لا يوجد تلاميذ في هذا القسم.</div>'}`;
}
function sessionsToday() {
  if (!S.sessions.length) return '';
  return `<div class="card"><h2>حصص اليوم</h2><table><tr><th>الحصة</th><th>القسم</th><th>التوقيت</th><th>الغيابات</th><th></th></tr>
    ${S.sessions.map((s) => `<tr><td>${esc(s.subject)}<div class="muted">${esc(s.teacher)}</div></td><td>${esc(s.class_name)}</td><td>${s.time_from}–${s.time_to}</td>
    <td><span class="tag ${s.n_abs ? 'red' : 'ok'}">${s.n_abs}</span></td><td><button class="btn ghost sm" onclick='openSession(${JSON.stringify(s.id)})'>فتح</button></td></tr>`).join('')}
  </table></div>`;
}
function openSession(id) { session = S.sessions.find((s) => s.id === id); lsSet('ghiyab_session', session); render(); }
async function startSession() {
  if (!val('sSubject') || !val('sTeacher')) return flash('أدخل المادة واسم الأستاذ', true);
  const body = { classId: val('sClass'), subject: val('sSubject'), teacher: val('sTeacher'), date: val('sDate'), from: val('sFrom'), to: val('sTo') };
  const r = await act(() => api('POST', '/api/sessions', body));
  if (!r) return;
  session = { id: r.id, class_id: body.classId, subject: body.subject, teacher: body.teacher, date: body.date, time_from: body.from, time_to: body.to };
  lsSet('ghiyab_session', session);
  if (stateDate !== body.date) { stateDate = body.date; await refresh(true); } else render();
  setTimeout(() => $('scanInput') && $('scanInput').focus(), 50);
}
function endSession() { session = null; lsSet('ghiyab_session', null); flashMsg = null; render(); }
function toggleAbs(studentId) {
  const a = S.absences.find((x) => x.session_id === session.id && x.student_id === studentId);
  if (a) {
    if (a.status === 'sent' || a.status === 'sending') return flash('أُرسل الإشعار للولي، لا يمكن إلغاء هذا الغياب', true);
    return act(() => api('DELETE', '/api/absences/' + a.id));
  }
  act(() => api('POST', '/api/absences', { sessionId: session.id, studentId }));
}
function scanCode(v) {
  v = String(v || '').replace(/\*/g, '').trim(); if (!v) return;
  act(() => api('POST', '/api/scan', { sessionId: session.id, code: v }), (r) => (r.already ? r.name + ' مسجّل غائباً من قبل' : '✓ سُجّل غياب ' + r.name));
}
async function scanImage(inp) {
  const f = inp.files && inp.files[0]; inp.value = ''; if (!f) return;
  if (!('BarcodeDetector' in window)) return flash('هذا المتصفح لا يقرأ الكودبار من الصور. استعمل قارئ كودبار أو اكتب الرقم.', true);
  try {
    const det = new BarcodeDetector({ formats: ['code_39', 'code_128', 'qr_code'] });
    const r = await det.detect(await createImageBitmap(f));
    if (!r.length) return flash('لم يُعثر على كودبار في الصورة', true);
    for (const x of r) scanCode(x.rawValue);
  } catch (e) { flash('تعذّرت قراءة الصورة', true); }
}

/* ---------------- الإشعارات ---------------- */
function vNotifs() {
  const auto = S.provider.auto;
  const all = S.absences; const t = now();
  const sent = all.filter((a) => a.status === 'sent');
  const failed = all.filter((a) => a.status === 'failed');
  const ready = auto ? [] : all.filter((a) => a.status === 'waiting' && a.notify_at <= t);
  const wait = all.filter((a) => a.status === 'sending' || (a.status === 'waiting' && (auto || a.notify_at > t)));
  const needAction = [...failed, ...ready];
  const badProv = S.provider.providers.filter((p) => !p.ready);

  const card = (a, kind) => {
    const manualBtns = a.intl ? `<a class="btn wa sm" href="https://wa.me/${a.intl}?text=${encodeURIComponent(a.message)}" target="_blank" rel="noopener" onclick="markSent('${a.id}','whatsapp')">واتساب</a>
      <a class="btn sm" href="sms:+${a.intl}?body=${encodeURIComponent(a.message)}" onclick="markSent('${a.id}','sms')">SMS</a>
      <button class="btn ghost sm" onclick="copyMsg('${a.id}')">نسخ</button>` : '<span class="muted">لا يوجد رقم للولي — أضفه من «الأقسام والتلاميذ».</span>';
    const tag = { action: a.status === 'failed' ? '<span class="tag red">فشل الإرسال</span>' : '<span class="tag red">جاهز للإرسال</span>',
      wait: a.status === 'sending' ? '<span class="tag amb">جارِ الإرسال…</span>' : `<span class="tag amb">${auto ? 'يُرسل آلياً بعد' : 'جاهز بعد'} <span class="cd" data-cd="${a.notify_at}">${cdText(a.notify_at)}</span></span>`,
      sent: '<span class="tag ok">أُرسل</span>' }[kind];
    return `<div class="notif">
      <div class="top"><div><b>${esc(a.student_name)}</b> <span class="muted">· ${esc(a.class_name)} · ${esc(a.subject)} · ${a.time_from}–${a.time_to}</span><br>
        <span class="muted">الولي: ${esc(a.parent || '—')} · <span style="direction:ltr;display:inline-block">${esc(a.phone || 'لا يوجد رقم')}</span></span></div>${tag}</div>
      ${kind !== 'sent' ? `<div class="msg">${esc(a.message)}</div>` : ''}
      ${a.status === 'failed' && a.last_error ? `<div class="flash err" style="font-size:12.5px">${esc(a.last_error)}</div>` : ''}
      <div class="act">
        ${kind === 'action' ? manualBtns : ''}
        ${kind === 'action' && a.status === 'failed' && auto ? `<button class="btn ghost sm" onclick="sendNow('${a.id}')">إعادة المحاولة</button>` : ''}
        ${kind === 'wait' && a.status === 'waiting' ? `<button class="btn ghost sm" onclick="sendNow('${a.id}')">${auto ? 'أرسل الآن' : 'جاهز الآن'}</button>` : ''}
        ${kind !== 'sent' && a.status !== 'sending' ? `<button class="btn ghost sm" onclick="markSent('${a.id}','manual')">أُعلم الولي بطريقة أخرى</button>` : ''}
        ${kind === 'sent' ? `<span class="muted">عبر ${({ whatsapp: 'واتساب', sms: 'SMS', manual: 'وسيلة أخرى' })[a.channel] || ''} · ${a.sent_at ? fmtTime(a.sent_at) : ''}</span>` : ''}
      </div></div>`;
  };
  return `<div class="card noprint"><div class="row" style="align-items:end">
      <label class="f" style="margin:0">اليوم<input type="date" value="${stateDate}" onchange="stateDate=this.value;refresh(true)"></label>
      <div class="muted" style="flex:2 1 220px">يُرسل إشعار كل غياب بعد <b>${S.cfg.delayMin}</b> دقيقة من تسجيله.</div>
    </div></div>
    <div class="banner ${auto && !badProv.length ? 'ok' : 'amb'}">${auto
      ? (badProv.length ? `⚠️ الإرسال الآلي مفعّل لكن إعدادات ${badProv.map((p) => p.name).join('، ')} ناقصة على الخادم.` : `✓ الإرسال الآلي مفعّل (${S.provider.providers.map((p) => p.name).join(' ثم ')}). لا حاجة لأي تدخل.`)
      : 'الإرسال الآلي غير مفعّل على الخادم: عند حلول الموعد اضغط «واتساب» أو «SMS» لإرسال الرسالة الجاهزة.'}</div>
    <div class="stats">
      <div class="stat"><b style="color:var(--red)">${needAction.length}</b><span>يحتاج إجراء</span></div>
      <div class="stat"><b style="color:var(--amber)">${wait.length}</b><span>في الانتظار</span></div>
      <div class="stat"><b style="color:var(--brand)">${sent.length}</b><span>أُرسل</span></div>
    </div>
    ${flashHTML()}
    ${!all.length ? '<div class="card empty">لا توجد غيابات مسجّلة في هذا اليوم.</div>' : ''}
    ${needAction.length ? `<h3 style="margin:6px 2px">يحتاج إجراء</h3>${needAction.map((a) => card(a, 'action')).join('')}` : ''}
    ${wait.length ? `<h3 style="margin:6px 2px">في الانتظار</h3>${wait.map((a) => card(a, 'wait')).join('')}` : ''}
    ${sent.length ? `<h3 style="margin:6px 2px">أُرسلت</h3>${sent.map((a) => card(a, 'sent')).join('')}` : ''}`;
}
function markSent(id, channel) { act(() => api('POST', `/api/absences/${id}/sent`, { channel })); }
function sendNow(id) { act(() => api('POST', `/api/absences/${id}/now`), S.provider.auto ? 'سيُرسل خلال أقل من دقيقة' : null); }
async function copyMsg(id) { const a = S.absences.find((x) => x.id === id); try { await navigator.clipboard.writeText(a.message); flash('نُسخت الرسالة'); } catch (e) { flash('تعذّر النسخ', true); } }

/* ---------------- الأقسام والتلاميذ ---------------- */
function vStudents() {
  if (selClass && !cls(selClass)) selClass = null;
  const c = selClass ? cls(selClass) : null;
  const list = c ? S.students.filter((s) => s.class_id === c.id) : [];
  return `<div class="card"><h2>الأقسام</h2>
    ${S.classes.length ? `<div class="row" style="margin-bottom:10px">${S.classes.map((k) => `<button class="btn ${k.id === selClass ? '' : 'ghost'} sm" style="flex:0 0 auto" onclick="pickClass('${k.id}')">${esc(k.name)} <span style="opacity:.7">(${S.students.filter((s) => s.class_id === k.id).length})</span></button>`).join('')}</div>` : '<p class="muted">لا توجد أقسام بعد.</p>'}
    <div class="row" style="align-items:end">
      <label class="f" style="margin:0">المستوى<select id="nLevel">${['1 متوسط', '2 متوسط', '3 متوسط', '4 متوسط', '1 ثانوي', '2 ثانوي', '3 ثانوي'].map((l) => `<option>${l}</option>`).join('')}</select></label>
      <label class="f" style="margin:0">الشعبة / الفوج<input id="nGroup" placeholder="مثال: علوم تجريبية 1"></label>
      <button class="btn" style="flex:0 0 auto" onclick="addClass()">+ قسم</button>
    </div>
    ${!S.classes.length ? `<div style="margin-top:10px"><button class="btn ghost" onclick="act(()=>api('POST','/api/demo'),'أُضيف قسم تجريبي')">أو أضف قسماً تجريبياً</button></div>` : ''}
  </div>
  ${flashHTML()}
  ${c ? `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h2 style="margin:0">${esc(c.name)} — ${list.length} تلميذ</h2>
      <button class="btn red sm" onclick="askDelClass('${c.id}')">حذف القسم</button></div>
    <div class="row" style="align-items:end;margin-top:10px">
      <label class="f" style="margin:0">اسم التلميذ(ة)<input id="aName"></label>
      <label class="f" style="margin:0">اسم الولي<input id="aParent"></label>
      <label class="f" style="margin:0">هاتف الولي<input id="aPhone" inputmode="tel" placeholder="0550 12 34 56" style="direction:ltr"></label>
      <button class="btn" style="flex:0 0 auto" onclick="addStudent()">+ تلميذ</button>
    </div>
    <details style="margin-top:10px"><summary class="muted" style="cursor:pointer">إضافة قائمة كاملة دفعة واحدة (من Excel)</summary>
      <p class="muted">سطر لكل تلميذ: الاسم، اسم الولي، الهاتف — مفصولة بفاصلة أو منسوخة مباشرة من أعمدة Excel.</p>
      <textarea id="bulk" placeholder="عبد الله سلطان، سلطان رشيد، 0550123456"></textarea>
      <button class="btn ghost" onclick="bulkAdd()">إضافة القائمة</button>
    </details>
    ${list.length ? `<table style="margin-top:10px"><tr><th>الرقم</th><th>الاسم</th><th>الولي</th><th>الهاتف</th><th></th></tr>
      ${list.map((s) => `<tr><td style="direction:ltr;text-align:start">${esc(s.code)}</td><td>${esc(s.name)}</td><td>${esc(s.parent)}</td><td class="ltr">${s.phone ? esc(s.phone) : '<span class="tag amb">ناقص</span>'}</td>
      <td><button class="btn ghost sm" onclick="editStudent('${s.id}')">تعديل</button></td></tr>`).join('')}</table>`
      : '<div class="empty">أضف تلاميذ هذا القسم. يتولد رقم وكودبار كل تلميذ تلقائياً.</div>'}
  </div>` : (S.classes.length ? '<div class="card empty">اختر قسماً لعرض تلاميذه.</div>' : '')}`;
}
function pickClass(id) { selClass = id; lsSet('ghiyab_selClass', id); render(); }
async function addClass() {
  const level = val('nLevel'), g = val('nGroup');
  const r = await act(() => api('POST', '/api/classes', { level, name: level + (g ? ' — ' + g : '') }), 'أُضيف القسم');
  if (r) pickClass(r.id);
}
function addStudent() {
  if (!val('aName')) return flash('أدخل اسم التلميذ', true);
  act(() => api('POST', '/api/students', { classId: selClass, name: val('aName'), parent: val('aParent'), phone: val('aPhone') }), 'أُضيف التلميذ');
}
function bulkAdd() {
  const rows = $('bulk').value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const p = l.split(/[,،;\t]/).map((x) => x.trim()); return { name: p[0], parent: p[1] || '', phone: p[2] || '' }; });
  if (!rows.length) return;
  act(() => api('POST', '/api/students', { classId: selClass, rows }), (r) => `أُضيف ${r.added} تلميذاً`);
}
function editStudent(id) {
  const s = S.students.find((x) => x.id === id);
  $('modal').innerHTML = `<div class="overlay" onclick="if(event.target===this)closeModal()"><div class="dialog">
    <h2 style="margin-top:0">تعديل التلميذ <span class="muted" style="direction:ltr;display:inline-block">${esc(s.code)}</span></h2>
    <label class="f">الاسم<input id="eName" value="${esc(s.name)}"></label>
    <label class="f">اسم الولي<input id="eParent" value="${esc(s.parent)}"></label>
    <label class="f">هاتف الولي<input id="ePhone" value="${esc(s.phone)}" style="direction:ltr"></label>
    <label class="f">القسم<select id="eClass">${S.classes.map((c) => `<option value="${c.id}" ${c.id === s.class_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <div class="row"><button class="btn" onclick="saveStudent('${id}')">حفظ</button><button class="btn ghost" onclick="closeModal()">إلغاء</button><button class="btn red" onclick="delStudent('${id}')">حذف</button></div>
  </div></div>`;
}
function saveStudent(id) {
  const body = { name: val('eName'), parent: val('eParent'), phone: val('ePhone'), classId: val('eClass') };
  closeModal(); act(() => api('PUT', '/api/students/' + id, body), 'حُفظ');
}
function delStudent(id) { closeModal(); act(() => api('DELETE', '/api/students/' + id), 'حُذف التلميذ'); }
function askDelClass(id) {
  const c = cls(id); const n = S.students.filter((s) => s.class_id === id).length;
  $('modal').innerHTML = `<div class="overlay"><div class="dialog"><h2 style="margin-top:0">حذف ${esc(c.name)}؟</h2>
    <p>سيُحذف القسم و${n} تلميذاً منه مع سجل غياباتهم. لا يمكن التراجع.</p>
    <div class="row"><button class="btn red" onclick="closeModal();act(()=>api('DELETE','/api/classes/${id}'),'حُذف القسم')">حذف</button><button class="btn ghost" onclick="closeModal()">إلغاء</button></div></div></div>`;
}
function closeModal() { $('modal').innerHTML = ''; }

/* ---------------- ملصقات الكودبار (Code 39) ---------------- */
const C39 = { 0: 'nnnwwnwnn', 1: 'wnnwnnnnw', 2: 'nnwwnnnnw', 3: 'wnwwnnnnn', 4: 'nnnwwnnnw', 5: 'wnnwwnnnn', 6: 'nnwwwnnnn', 7: 'nnnwnnwnw', 8: 'wnnwnnwnn', 9: 'nnwwnnwnn', '*': 'nwnnwnwnn' };
function barcodeSVG(code) {
  const chars = ('*' + code + '*').split(''); let x = 10; const N = 2, W = 5, H = 60; let rects = '';
  chars.forEach((ch, ci) => {
    const p = C39[ch]; if (!p) return;
    for (let i = 0; i < 9; i++) { const w = p[i] === 'w' ? W : N; if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${w}" height="${H}"/>`; x += w; }
    if (ci < chars.length - 1) x += N;
  });
  return `<svg viewBox="0 0 ${x + 10} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}
function vLabels() {
  if (!S.classes.length) return '<div class="card empty">أضف الأقسام والتلاميذ أولاً.</div>';
  if (!labelClass || !cls(labelClass)) labelClass = S.classes[0].id;
  const list = S.students.filter((s) => s.class_id === labelClass); const c = cls(labelClass);
  return `<div class="card noprint"><h2>ملصقات الكودبار</h2>
    <p class="muted" style="margin-top:0">لكل تلميذ رقم وكودبار يتولدان تلقائياً. تُطبع وتُلصق في الدفتر اليومي، وتُقرأ بأي قارئ كودبار أو بكاميرا الهاتف.</p>
    <div class="row" style="align-items:end"><label class="f" style="margin:0">القسم<select onchange="labelClass=this.value;render()">${S.classes.map((k) => `<option value="${k.id}" ${k.id === labelClass ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}</select></label>
    <button class="btn" style="flex:0 0 auto" onclick="window.print()">🖨️ طباعة</button></div></div>
  ${list.length ? `<div class="labels">${list.map((s) => `<div class="label"><div class="ln">${esc(s.name)}</div><div class="lc">${esc(c.name)} · ${esc(S.cfg.school)}</div>${barcodeSVG(s.code)}<div class="code">${esc(s.code)}</div></div>`).join('')}</div>` : '<div class="card empty">لا يوجد تلاميذ في هذا القسم.</div>'}`;
}

/* ---------------- الإعدادات ---------------- */
function vSettings() {
  const c = S.cfg;
  const admin = isAdmin();
  return `${flashHTML()}
  ${admin ? `<div class="card"><h2>إعدادات المؤسسة</h2>
    <label class="f">اسم المؤسسة<input id="cSchool" value="${esc(c.school)}"></label>
    <div class="row">
      <label class="f">مهلة الإشعار بعد تسجيل الغياب (بالدقائق)<input id="cDelay" type="number" min="0" value="${esc(c.delayMin)}"></label>
      <label class="f">رمز الدولة للهاتف<input id="cCc" value="${esc(c.cc)}" style="direction:ltr"></label>
    </div>
    <label class="f">نص الرسالة للولي<textarea id="cTpl" style="min-height:140px">${esc(c.template)}</textarea></label>
    <p class="muted" style="margin-top:-4px">المتغيرات: {الاسم} {الرقم} {القسم} {المادة} {الأستاذ} {التاريخ} {من} {إلى} {المؤسسة}</p>
    <button class="btn" onclick="saveSettings()">حفظ</button></div>
  <div class="card"><h2>المستخدمون</h2>
    <table><tr><th>الاسم</th><th>المستخدم</th><th>الصفة</th><th></th></tr>
    ${S.users.map((u) => `<tr><td>${esc(u.name)}</td><td style="direction:ltr;text-align:start">${esc(u.username)}</td><td>${u.role === 'admin' ? 'إدارة' : 'مشرف'}</td>
      <td>${u.id !== S.me.id ? `<button class="btn ghost sm" onclick="act(()=>api('DELETE','/api/users/${u.id}'),'حُذف المستخدم')">حذف</button>` : ''}</td></tr>`).join('')}</table>
    <div class="row" style="align-items:end;margin-top:10px">
      <label class="f" style="margin:0">الاسم<input id="uName" placeholder="المشرف أحمد"></label>
      <label class="f" style="margin:0">اسم المستخدم (لاتيني)<input id="uUser" style="direction:ltr" placeholder="ahmed"></label>
      <label class="f" style="margin:0">كلمة المرور<input id="uPass" type="text" style="direction:ltr"></label>
      <label class="f" style="margin:0">الصفة<select id="uRole"><option value="supervisor">مشرف</option><option value="admin">إدارة</option></select></label>
      <button class="btn" style="flex:0 0 auto" onclick="addUser()">+ مستخدم</button>
    </div></div>` : ''}
  <div class="card"><h2>تغيير كلمة المرور</h2>
    <div class="row" style="align-items:end">
      <label class="f" style="margin:0">الحالية<input id="pCur" type="password" style="direction:ltr"></label>
      <label class="f" style="margin:0">الجديدة<input id="pNew" type="password" style="direction:ltr"></label>
      <button class="btn" style="flex:0 0 auto" onclick="changePass()">تغيير</button>
    </div></div>`;
}
function saveSettings() {
  act(() => api('PUT', '/api/config', { school: val('cSchool'), delayMin: Number(val('cDelay')), cc: val('cCc'), template: $('cTpl').value }), 'حُفظت الإعدادات');
}
function addUser() {
  act(() => api('POST', '/api/users', { name: val('uName'), username: val('uUser'), password: val('uPass'), role: val('uRole') }), 'أُضيف المستخدم');
}
function changePass() {
  act(() => api('PUT', '/api/me/password', { current: $('pCur').value, password: $('pNew').value }), 'تغيّرت كلمة المرور');
}

/* ---------------- البدء ---------------- */
refresh(true).catch(() => showLogin());
