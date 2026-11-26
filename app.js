(() => {
'use strict';
const CFG = window.CONFIG;
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
const S = { token: sessionStorage.getItem('uc_tok') || '', user: null, master: null };

const ST = {
  Submitted: ['รอตรวจสอบ', 'st-pink'], Assigned: ['รอรับงาน', 'st-tan'], InProgress: ['กำลังแก้ไข', 'st-tan'],
  PendingReview: ['รอตรวจปิดงาน', 'st-pink'], Closed: ['ปิดงานแล้ว', 'st-green'], Rejected: ['ปฏิเสธ', 'st-red'],
  Reopened: ['ส่งกลับแก้ไข', 'st-red']
};
const SEV_RANK = { High: 0, Medium: 1, Low: 2 };
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const has = r => S.user.roles.indexOf(r) >= 0;
const RLAB = { admin: 'แอดมิน', fixer: 'ผู้แก้ไข', reporter: 'ผู้แจ้ง' };
const fmt = d => d ? new Date(d).toLocaleString('th-TH-u-ca-gregory', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }) : '-';
const sevBadge = s => `<span class="badge sev-${esc(s)}">${esc(s)}</span>`;
const stBadge = s => { const [t, c] = ST[s] || [s, 'st-tan']; return `<span class="badge ${c}">${esc(t)}</span>`; };
const pad = n => String(n).padStart(2, '0');
const localInput = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const stampTime = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

let toastT;
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toastT); toastT = setTimeout(() => t.className = '', err ? 9000 : 3500);
}

/* ---------------- API ---------------- */
async function api(action, data = {}) {
  let res;
  try {
    res = await fetch(CFG.API_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, idToken: S.token, ...data })
    });
  } catch (e) { throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'); }
  let j;
  try { j = await res.json(); } catch (e) { throw new Error('เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง'); }
  if (j.error === 'AUTH') { logout('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'); throw new Error('AUTH'); }
  if (j.error) throw new Error(j.error);
  return j.data;
}

/* ---------------- auth ---------------- */
function logout(msg) {
  S.token = ''; S.user = null; sessionStorage.removeItem('uc_tok');
  renderLogin(msg);
}
function renderLogin(msg) {
  app.innerHTML = `
  <div class="login">
    <div class="logo"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#FBF3DF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M12 8v5"/><path d="M12 16.5v.01"/></svg></div>
    <div><h1 style="font-size:30px;line-height:1.25">ระบบรายงาน<br>สภาพไม่ปลอดภัย</h1>
    <p class="muted">Detect early, report fast, prevent accident</p></div>
    <div id="gbtn"></div>
    <p class="muted">ใช้อีเมลองค์กรเท่านั้น ระบบจะกำหนดสิทธิ์ตามบทบาทของคุณ</p>
    <p class="err-msg">${esc(msg || '')}</p>
  </div>`;
  const init = () => {
    if (!window.google || !google.accounts) return setTimeout(init, 200);
    google.accounts.id.initialize({ client_id: CFG.GOOGLE_CLIENT_ID, callback: onCred });
    google.accounts.id.renderButton($('#gbtn'), { theme: 'outline', size: 'large', text: 'signin_with', locale: 'th', width: 280 });
  };
  init();
}
function onCred(resp) {
  S.token = resp.credential; sessionStorage.setItem('uc_tok', S.token);
  start();
}
async function start() {
  if (!S.token) return renderLogin();
  app.innerHTML = '<div class="wrap muted">กำลังโหลด...</div>';
  try {
    S.user = await api('me');
    S.master = await api('master');
  } catch (e) {
    if (e.message !== 'AUTH') logout(e.message);
    return;
  }
  route();
}

/* ---------------- layout ---------------- */
function shell(html) {
  const u = S.user, h = location.hash || '#/';
  const link = (href, text) => `<a href="${href}" class="${h.startsWith(href) ? 'on' : ''}">${text}</a>`;
  let links = link('#/report', 'แจ้ง UC') + link('#/mine', 'รายงานของฉัน');
  if (has('fixer')) links += link('#/tasks', 'งานของฉัน');
  if (has('admin')) links += link('#/inbox', 'รอตรวจสอบ') + link('#/review', 'รอตรวจปิดงาน') + link('#/dash', 'Dashboard') + link('#/users', 'ผู้ใช้');
  app.innerHTML = `
  <div class="nav"><b>UC Report</b><div class="links">${links}</div>
    <div class="who">${esc(u.name)} · ${esc(u.roles.map(r => RLAB[r]).join(' + '))} <button id="lo">ออก</button></div></div>
  <div class="wrap" id="page">${html}</div>`;
  $('#lo').onclick = () => logout();
}
const loading = () => shell('<p class="muted">กำลังโหลด...</p>');
const fail = e => { if (e.message !== 'AUTH') shell(`<p class="err-msg">${esc(e.message)}</p>`); };

/* ---------------- router ---------------- */
function route() {
  const h = location.hash || '';
  const u = S.user;
  const home = has('admin') ? '#/inbox' : has('fixer') ? '#/tasks' : '#/report';
  if (!h || h === '#/') { location.hash = home; return; }
  let m;
  if (h === '#/report') return pageReport();
  if (h === '#/mine') return pageList('รายงานของฉัน', 'mine');
  if (h === '#/tasks' && has('fixer')) return pageList('งานของฉัน', 'tasks');
  if (h === '#/inbox' && has('admin')) return pageList('รอตรวจสอบ', 'all', ['Submitted']);
  if (h === '#/review' && has('admin')) return pageList('รอตรวจปิดงาน', 'all', ['PendingReview']);
  if (h === '#/dash' && has('admin')) return pageDash();
  if (h === '#/users' && has('admin')) return pageUsers();
  if ((m = h.match(/^#\/r\/([\w-]+)$/))) return pageDetail(m[1]);
  location.hash = home;
}
window.addEventListener('hashchange', () => { if (S.user) route(); });

/* ---------------- camera (ถ่ายสดเท่านั้น + GPS + timestamp) ---------------- */
function camera(label) {
  return new Promise((resolve, reject) => {
    const ov = document.createElement('div');
    ov.className = 'cam';
    ov.innerHTML = `<video playsinline muted autoplay></video><div class="cam-stamp"></div>
      <div class="cam-bar"><button class="btn ghost" id="cx" type="button">ยกเลิก</button>
      <button class="shutter" id="shot" type="button" aria-label="ถ่ายรูป" disabled></button><span id="cst">กำลังหาตำแหน่ง...</span></div>`;
    document.body.appendChild(ov);
    const video = $('video', ov), stampEl = $('.cam-stamp', ov), shot = $('#shot', ov), cst = $('#cst', ov);
    let stream, wid, tick, pos = null;
    const finish = (val, err) => {
      clearInterval(tick);
      if (wid != null) navigator.geolocation.clearWatch(wid);
      if (stream) stream.getTracks().forEach(t => t.stop());
      ov.remove();
      err ? reject(err) : resolve(val);
    };
    const lines = () => [stampTime(new Date()),
      pos ? `${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)} · ±${Math.round(pos.accuracy)} ม.` : 'ยังไม่ได้ตำแหน่ง', label];
    tick = setInterval(() => { stampEl.textContent = lines().join('\n'); }, 500);
    $('#cx', ov).onclick = () => finish(null, new Error('CANCEL'));

    if (!navigator.mediaDevices || !navigator.geolocation) return finish(null, new Error('อุปกรณ์/เบราว์เซอร์ไม่รองรับกล้องหรือ GPS (ต้องเปิดผ่าน HTTPS)'));
    navigator.geolocation.getCurrentPosition(() => {}, () => {}, { enableHighAccuracy: true });
    wid = navigator.geolocation.watchPosition(p => {
      pos = p.coords; cst.textContent = `GPS ±${Math.round(p.coords.accuracy)} ม.`; shot.disabled = !stream;
    }, () => { cst.textContent = 'ไม่ได้รับสิทธิ์ GPS: อนุญาตตำแหน่งก่อน'; }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false })
      .then(s => { stream = s; video.srcObject = s; shot.disabled = !pos; })
      .catch(() => finish(null, new Error('เปิดกล้องไม่ได้: อนุญาตการใช้กล้องแล้วลองใหม่')));

    shot.onclick = () => {
      if (!pos || !video.videoWidth) return;
      const sc = Math.min(1, 1280 / video.videoWidth);
      const c = document.createElement('canvas');
      c.width = Math.round(video.videoWidth * sc); c.height = Math.round(video.videoHeight * sc);
      const x = c.getContext('2d');
      x.drawImage(video, 0, 0, c.width, c.height);
      const ls = lines(), fs = Math.max(14, Math.round(c.width / 48)), bh = fs * 1.5 * ls.length + fs;
      x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(0, c.height - bh, c.width, bh);
      x.fillStyle = '#fff'; x.font = `${fs}px sans-serif`; x.textBaseline = 'top';
      ls.forEach((t, i) => x.fillText(t, fs / 2, c.height - bh + fs / 2 + i * fs * 1.5));
      const out = { dataUrl: c.toDataURL('image/jpeg', 0.7), lat: pos.latitude, lng: pos.longitude, acc: Math.round(pos.accuracy), capturedAt: new Date().toISOString() };
      finish(out);
    };
  });
}
async function takePhoto(label) {
  try { return await camera(label); }
  catch (e) { if (e.message !== 'CANCEL') toast(e.message, true); return null; }
}
function photoPicker(box, max, label) {
  const shots = [];
  const draw = () => {
    box.innerHTML = '<div class="photos">' + shots.map((s, i) =>
      `<div class="shot"><img class="thumb" src="${s.dataUrl}" alt="รูปที่ ${i + 1}"><button type="button" data-i="${i}" aria-label="ลบรูป">×</button></div>`).join('') +
      (shots.length < max ? `<button type="button" class="add-photo" id="addp" aria-label="เพิ่มรูป"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6F5247" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></button>` : '') + '</div>';
    box.querySelectorAll('.shot button').forEach(b => b.onclick = () => { shots.splice(+b.dataset.i, 1); draw(); box.dispatchEvent(new Event('change')); });
    const a = $('#addp', box);
    if (a) a.onclick = async () => { const p = await takePhoto(label()); if (p) { shots.push(p); draw(); box.dispatchEvent(new Event('change')); } };
  };
  draw();
  return shots;
}
function loadPhotos(box, ids) {
  if (!ids.length) { box.innerHTML = '<span class="muted">ไม่มีรูป</span>'; return; }
  box.innerHTML = '<div class="photos">' + ids.map(() => '<div class="thumb ph">กำลังโหลด...</div>').join('') + '</div>';
  const cells = box.querySelectorAll('.thumb');
  ids.forEach((id, i) => api('photo', { id }).then(u => {
    cells[i].outerHTML = `<a href="${u}" target="_blank" rel="noopener"><img class="thumb" src="${u}" alt="รูป"></a>`;
  }).catch(() => { cells[i].textContent = 'โหลดไม่ได้'; }));
}

/* ---------------- pages ---------------- */
function pageReport() {
  const m = S.master;
  if (!m.areas.length) return shell('<p class="err-msg">ยังไม่มีพื้นที่ในระบบ แจ้งแอดมินเพิ่มในแท็บ Areas</p>');
  shell(`<div class="narrow"><h1>แจ้งสภาพไม่ปลอดภัย</h1>
    <label for="ar">พื้นที่</label>
    <select id="ar">${m.areas.map(a => `<option>${esc(a.area)}</option>`).join('')}</select>
    <label for="ty">ประเภทความเสี่ยง</label><select id="ty"></select>
    <label>ระดับความรุนแรง</label>
    <div class="sev-pick" id="sv"><button type="button" data-v="Low">Low</button><button type="button" data-v="Medium">Medium</button><button type="button" data-v="High">High</button></div>
    <label for="dt">รายละเอียด</label><textarea id="dt" maxlength="1000"></textarea>
    <label>รูปภาพ (ถ่ายด้วยกล้องเท่านั้น สูงสุด 3 รูป)</label><div id="ph"></div>
    <p class="muted">ระบบบันทึกเวลาและตำแหน่ง GPS ลงบนรูปอัตโนมัติ</p>
    <button class="btn block" id="go" style="margin-top:16px">ส่งรายงาน</button></div>`);
  const fillTypes = () => {
    const a = m.areas.find(x => x.area === $('#ar').value);
    $('#ty').innerHTML = (a && a.types.length ? a.types : ['อื่น ๆ']).map(t => `<option>${esc(t)}</option>`).join('');
  };
  $('#ar').onchange = fillTypes; fillTypes();
  let sev = '';
  $('#sv').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    sev = b.dataset.v; $('#sv').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  };
  const shots = photoPicker($('#ph'), 3, () => 'UC · ' + $('#ar').value);
  $('#go').onclick = async () => {
    if (!sev) return toast('เลือกระดับความรุนแรง', true);
    if (!$('#dt').value.trim()) return toast('กรอกรายละเอียด', true);
    if (!shots.length) return toast('ถ่ายรูปอย่างน้อย 1 รูป', true);
    $('#go').disabled = true; $('#go').textContent = 'กำลังส่ง...';
    try {
      const r = await api('submitReport', {
        area: $('#ar').value, type: $('#ty').value, severity: sev, detail: $('#dt').value.trim(),
        photos: shots.map(s => ({ dataUrl: s.dataUrl })), lat: shots[0].lat, lng: shots[0].lng, acc: shots[0].acc
      });
      toast('ส่งรายงานแล้ว ' + r.id);
      location.hash = '#/mine';
    } catch (e) { if (e.message !== 'AUTH') toast(e.message, true); $('#go').disabled = false; $('#go').textContent = 'ส่งรายงาน'; }
  };
}

async function pageList(title, scope, statuses) {
  loading();
  try {
    let rows = await api('listReports', { scope, statuses });
    rows.sort((a, b) => (SEV_RANK[a.severity] - SEV_RANK[b.severity]) || (new Date(b.createdAt) - new Date(a.createdAt)));
    if (scope !== 'all') rows.sort((a, b) => (a.status === 'Closed') - (b.status === 'Closed'));
    shell(`<h1 style="margin-bottom:14px">${esc(title)} <span class="muted">(${rows.length})</span></h1>` +
      (rows.length ? rows.map(r => `
      <a class="item" href="#/r/${esc(r.id)}">
        <div class="top"><b>${esc(r.id)}</b><span>${sevBadge(r.severity)} ${stBadge(r.status)}</span></div>
        <div>${esc(r.area)} · ${esc(r.type)}</div>
        <div class="muted">${esc(r.detail)}</div>
        <div class="muted">แจ้งเมื่อ ${fmt(r.createdAt)} · ${esc(r.reporterName)}${r.dueDate ? ' · กำหนดเสร็จ ' + fmt(r.dueDate) : ''}${r.overdue ? ' <span class="od">เลยกำหนด</span>' : ''}</div>
      </a>`).join('') : '<p class="muted">ไม่มีรายการ</p>'));
  } catch (e) { fail(e); }
}

async function pageDetail(id) {
  loading();
  let r;
  try { r = await api('getReport', { id }); } catch (e) { return fail(e); }
  const u = S.user, mine = r.fixerEmail === u.email;
  const maps = (la, ln) => la !== '' && la != null ? `<a href="https://www.google.com/maps?q=${la},${ln}" target="_blank" rel="noopener">${(+la).toFixed(5)}, ${(+ln).toFixed(5)}</a>` : '-';
  const after = r.photosAfter.length ? `
    <div class="card"><h2>หลังแก้ไข</h2><div id="pa"></div>
      <p class="muted">ถ่ายเมื่อ ${fmt(r.afterAt)} · ${maps(r.afterLat, r.afterLng)}</p>
      <div class="chk ${r.distanceM !== '' && r.distanceM <= r.radiusM ? 'ok' : 'bad'}">${r.distanceM !== '' && r.distanceM <= r.radiusM ? '✔' : '✖'} ห่างจุดที่แจ้ง ${r.distanceM === '' ? '-' : r.distanceM + ' ม.'} (เกณฑ์ ${r.radiusM} ม.)</div>
      <div class="chk ${r.timeOk ? 'ok' : 'bad'}">${r.timeOk ? '✔ เวลารูปตรงกับเวลาเซิร์ฟเวอร์' : '✖ เวลารูปไม่ตรงกับเวลาเซิร์ฟเวอร์'}</div>
      ${r.fixNote ? `<p>หมายเหตุผู้แก้ไข: ${esc(r.fixNote)}</p>` : ''}</div>` : '';
  shell(`
    <div class="row" style="margin-bottom:14px"><h1>${esc(r.id)} · ${esc(r.area)}</h1>${sevBadge(r.severity)} ${stBadge(r.status)}${r.overdue ? '<span class="od">เลยกำหนด</span>' : ''}</div>
    <div class="grid">
      <div class="card"><h2>ก่อนแก้ไข</h2><div id="pb"></div>
        <p class="muted">แจ้งเมื่อ ${fmt(r.createdAt)} · ${maps(r.lat, r.lng)}</p></div>
      ${after}
    </div>
    <div class="card"><div class="kv">
      <div><span>ประเภทความเสี่ยง</span><b>${esc(r.type)}</b></div>
      <div><span>ผู้แจ้ง</span><b>${esc(r.reporterName)}</b></div>
      <div><span>ผู้แก้ไข</span><b>${esc(r.fixerEmail || '-')}</b></div>
      <div><span>กำหนดเสร็จ</span><b>${fmt(r.dueDate)}</b></div>
      <div style="grid-column:1/-1"><span>รายละเอียด</span><b>${esc(r.detail)}</b></div>
      ${r.adminNote ? `<div style="grid-column:1/-1"><span>คำสั่งแอดมิน</span><b>${esc(r.adminNote)}</b></div>` : ''}
      ${r.rejectReason ? `<div style="grid-column:1/-1"><span>เหตุผลที่ปฏิเสธ</span><b>${esc(r.rejectReason)}</b></div>` : ''}
      ${r.reviewNote ? `<div style="grid-column:1/-1"><span>เหตุผลที่ส่งกลับแก้ไข</span><b>${esc(r.reviewNote)}</b></div>` : ''}
    </div></div>
    <div id="panel"></div>`);
  loadPhotos($('#pb'), r.photosBefore);
  if (r.photosAfter.length) loadPhotos($('#pa'), r.photosAfter);
  const panel = $('#panel');
  const done = async (fn, okMsg, btn, next) => {
    btn.disabled = true;
    try {
      const res = await fn();
      const lineBad = res && res.line && !res.line.ok;
      toast(lineBad ? okMsg + ' แต่ส่ง LINE ไม่สำเร็จ: ' + res.line.why : okMsg, lineBad);
      location.hash = next || '#/mine';
    }
    catch (e) { if (e.message !== 'AUTH') toast(e.message, true); btn.disabled = false; }
  };

  if (has('admin') && r.status === 'Submitted') {
    const fx = S.master.fixers, def = (S.master.areas.find(a => a.area === r.area) || {}).defaultFixer;
    panel.innerHTML = `<div class="card"><h2>ตรวจสอบและมอบหมาย</h2><div class="grid">
      <div><label for="vs">ระดับความรุนแรง</label><select id="vs">${['Low', 'Medium', 'High'].map(s => `<option ${s === r.severity ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div><label for="vf">ผู้แก้ไข</label><select id="vf">${fx.map(f => `<option value="${esc(f.email)}" ${f.email === def ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></div>
      <div><label for="vd">กำหนดเสร็จ</label><input id="vd" type="datetime-local"></div></div>
      <label for="vi">คำสั่งถึงผู้แก้ไข</label><textarea id="vi"></textarea>
      <label for="vr">เหตุผล (กรณีปฏิเสธ)</label><input id="vr">
      <div class="row" style="margin-top:14px"><button class="btn" id="va">ยืนยันและมอบหมาย (ส่ง LINE)</button><button class="btn danger" id="vx">ปฏิเสธรายงาน</button></div></div>`;
    const setDue = () => { $('#vd').value = localInput(new Date(Date.now() + (S.master.dueDays[$('#vs').value] || 3) * 864e5)); };
    $('#vs').onchange = setDue; setDue();
    if (!fx.length) toast('ยังไม่มีผู้ใช้ที่เป็น fixer ในแท็บ Users', true);
    $('#va').onclick = () => done(() => api('verify', { id, decision: 'assign', severity: $('#vs').value, fixerEmail: $('#vf').value, due: new Date($('#vd').value).toISOString(), instruction: $('#vi').value }), 'มอบหมายแล้ว', $('#va'), '#/inbox');
    $('#vx').onclick = () => { if (!$('#vr').value.trim()) return toast('ใส่เหตุผลที่ปฏิเสธ', true); done(() => api('verify', { id, decision: 'reject', reason: $('#vr').value }), 'ปฏิเสธแล้ว', $('#vx'), '#/inbox'); };
  }

  if (has('admin') && r.status === 'PendingReview' && r.fixerEmail === u.email) {
    panel.innerHTML = '<div class="card"><b>คุณเป็นผู้แก้ไขงานนี้</b><p class="muted">ต้องให้แอดมินคนอื่นเป็นผู้ตรวจและอนุมัติปิดงาน</p></div>';
  } else if (has('admin') && r.status === 'PendingReview') {
    panel.innerHTML = `<div class="card"><h2>ตัดสินผลการปิดงาน</h2>
      <label for="rr">เหตุผล (กรณีส่งกลับแก้ไข)</label><textarea id="rr"></textarea>
      <div class="row" style="margin-top:14px"><button class="btn" id="ra">อนุมัติปิดงาน</button><button class="btn danger" id="rx">ส่งกลับแก้ไข</button></div></div>`;
    $('#ra').onclick = () => done(() => api('reviewClose', { id, decision: 'approve' }), 'ปิดงานแล้ว', $('#ra'), '#/review');
    $('#rx').onclick = () => { if (!$('#rr').value.trim()) return toast('ใส่เหตุผลที่ส่งกลับ', true); done(() => api('reviewClose', { id, decision: 'reject', reason: $('#rr').value }), 'ส่งกลับแก้ไขแล้ว', $('#rx'), '#/review'); };
  }

  if (mine && r.status === 'Assigned') {
    panel.innerHTML = `<div class="card"><button class="btn" id="ac">รับงาน</button></div>`;
    $('#ac').onclick = async () => { $('#ac').disabled = true; try { await api('acceptTask', { id }); toast('รับงานแล้ว'); pageDetail(id); } catch (e) { if (e.message !== 'AUTH') toast(e.message, true); $('#ac').disabled = false; } };
  }
  if (mine && ['InProgress', 'Reopened'].includes(r.status)) {
    panel.innerHTML = `<div class="card"><h2>ปิดงาน: ถ่ายรูปหลังแก้ไข (ถ่ายสด)</h2><div id="cp"></div>
      <label for="cn">หมายเหตุการแก้ไข</label><input id="cn" maxlength="500">
      <button class="btn block" id="cs" style="margin-top:14px" disabled>ส่งตรวจปิดงาน</button></div>`;
    const shots = photoPicker($('#cp'), 3, () => r.id + ' · หลังแก้ไข');
    $('#cp').addEventListener('change', () => { $('#cs').disabled = !shots.length; });
    $('#cs').onclick = () => { const p = shots[0]; done(() => api('submitClose', { id, photos: shots.map(s => ({ dataUrl: s.dataUrl })), lat: p.lat, lng: p.lng, acc: p.acc, capturedAt: p.capturedAt, note: $('#cn').value }), 'ส่งตรวจปิดงานแล้ว', $('#cs'), '#/tasks'); };
  }
}

async function pageUsers() {
  loading();
  let regs, users;
  try { [regs, users] = await Promise.all([api('listRegistrations'), api('listUsers')]); } catch (e) { return fail(e); }
  const box = (rs, dis) => `<span class="rbox">
    <label class="chip"><input type="checkbox" checked disabled> ผู้แจ้ง</label>
    <label class="chip"><input type="checkbox" class="rf" ${rs.includes('fixer') ? 'checked' : ''} ${dis ? 'disabled' : ''}> ผู้แก้ไข</label>
    <label class="chip"><input type="checkbox" class="ra" ${rs.includes('admin') ? 'checked' : ''} ${dis ? 'disabled' : ''}> แอดมิน</label></span>`;
  const collect = el => ['reporter', ...($('.rf', el).checked ? ['fixer'] : []), ...($('.ra', el).checked ? ['admin'] : [])];
  const pend = regs.filter(r => r.status === 'Pending');
  shell(`<h1 style="margin-bottom:14px">ผู้ใช้</h1>
    <h2>รออนุมัติ (${pend.length})</h2>
    ${pend.length ? pend.map(r => `<div class="card" data-id="${esc(r.id)}"><div class="row"><b>${esc(r.name)}</b><span class="muted">${esc(r.email)}</span><span class="muted">ขอบทบาท: ${esc(String(r.requestedRole).split(',').map(x => RLAB[x] || x).join(' + '))} · ${fmt(r.at)}</span></div>
      <div class="row" style="margin-top:10px">${box(String(r.requestedRole).split(','), false)}
      <button class="btn ap">อนุมัติ</button><button class="btn danger rj">ไม่อนุมัติ</button></div></div>`).join('') : '<p class="muted">ไม่มีคำขอที่รออนุมัติ</p>'}
    <h2 style="margin-top:24px">ผู้ใช้ทั้งหมด (${users.length})</h2>
    <p class="muted">หนึ่งคนมีได้หลายบทบาท เช่น ผู้แจ้ง + ผู้แก้ไข (ทุกคนแจ้งได้เสมอ)</p>
    <div class="card scroll"><table><thead><tr><th>ชื่อ</th><th>อีเมล</th><th>บทบาท</th><th>LINE</th><th></th></tr></thead><tbody>
    ${users.map(x => { const self = x.email.toLowerCase() === S.user.email; return `<tr data-email="${esc(x.email)}"><td>${esc(x.name)}</td><td>${esc(x.email)}</td>
      <td>${box(x.roles, self)}</td>
      <td class="${x.hasLine ? 'ok' : 'bad'}">${x.hasLine ? 'ผูกแล้ว' : 'ยังไม่ผูก'}</td>
      <td>${self ? '<span class="muted">(คุณ)</span>' : '<button class="btn ghost sr">บันทึก</button>'}</td></tr>`; }).join('')}
    </tbody></table></div>`);
  const act = async (btn, fn, ok) => {
    btn.disabled = true;
    try {
      const res = await fn();
      const bad = res && res.line && !res.line.ok;
      toast(bad ? ok + ' แต่ส่ง LINE ไม่สำเร็จ: ' + res.line.why : ok, bad);
      pageUsers();
    } catch (e) { if (e.message !== 'AUTH') toast(e.message, true); btn.disabled = false; }
  };
  $('#page').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const card = b.closest('.card[data-id]'), row = b.closest('tr[data-email]');
    if (b.classList.contains('ap')) act(b, () => api('decideRegistration', { id: card.dataset.id, decision: 'approve', roles: collect(card) }), 'อนุมัติแล้ว');
    if (b.classList.contains('rj')) act(b, () => api('decideRegistration', { id: card.dataset.id, decision: 'reject' }), 'ไม่อนุมัติแล้ว');
    if (b.classList.contains('sr')) act(b, () => api('setRole', { email: row.dataset.email, roles: collect(row) }), 'บันทึกบทบาทแล้ว');
  };
}

async function pageDash() {
  loading();
  const m = S.master;
  let area = '', sev = '';
  const load = async () => {
    let d;
    try { d = await api('dashboard', { area, severity: sev }); } catch (e) { return fail(e); }
    const mo = d.monthly, withAvg = mo.filter(x => x.avgCloseDays != null);
    const base = withAvg[0], last = withAvg[withAvg.length - 1];
    const target = base ? Math.round(base.avgCloseDays * 0.7 * 10) / 10 : null;
    const maxV = Math.max(1, ...(withAvg.map(x => x.avgCloseDays)), target || 0) * 1.1;
    const lab = k => MONTHS[+k.slice(5) - 1];
    let take = 'ยังไม่มีงานที่ปิดแล้ว จึงยังไม่มีข้อมูลเวลา Close Out';
    if (base && last) {
      if (base === last) take = `เดือน ${lab(base.key)} เวลาปิดงานเฉลี่ย ${last.avgCloseDays} วัน (เดือนแรกที่มีข้อมูล ใช้เป็นฐานเทียบ)`;
      else {
        const ch = Math.round((last.avgCloseDays - base.avgCloseDays) / base.avgCloseDays * 100);
        take = `เวลาปิดงานเฉลี่ย${ch <= 0 ? 'ลดลง' : 'เพิ่มขึ้น'} ${Math.abs(ch)}% จากเดือน ${lab(base.key)} ` +
          (last.avgCloseDays <= target ? 'ถึงเป้า −30% แล้ว' : `ยังห่างจากเป้า −30% (${target} วัน) อยู่ ${Math.round((last.avgCloseDays - target) * 10) / 10} วัน`);
      }
    }
    const baseRep = mo.find(x => x.reports > 0), curRep = mo[5];
    const repCh = baseRep && baseRep !== curRep ? Math.round((curRep.reports - baseRep.reports) / baseRep.reports * 100) : null;
    const C = 2 * Math.PI * 38, cols = ['#4A2C23', '#4F7A30', '#F4B6C2', '#C73550', '#C9B58A'];
    const tot = d.types.reduce((s, x) => s + x.count, 0) || 1;
    let off = 0;
    const donut = d.types.slice(0, 5).map((t, i) => {
      const len = t.count / tot * C, el = `<circle cx="50" cy="50" r="38" fill="none" stroke="${cols[i]}" stroke-width="16" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 50 50)"/>`;
      off += len; return el;
    }).join('');
    const maxA = Math.max(1, ...d.areas.map(a => a.count));
    $('#dd').innerHTML = `
      <div class="cards">
        <div class="stat"><span>Open</span><b>${d.counts.open}</b></div>
        <div class="stat"><span>In Progress</span><b>${d.counts.inProgress}</b></div>
        <div class="stat"><span>รอตรวจปิดงาน</span><b>${d.counts.pendingReview}</b></div>
        <div class="stat g"><span>Closed</span><b>${d.counts.closed}</b></div>
        <div class="stat r"><span>Overdue</span><b class="od">${d.counts.overdue}</b></div></div>
      <div class="cards" style="grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))">
        <div class="stat"><span>เวลาแจ้งเตือนเฉลี่ยเดือนนี้ (เป้า ≤ 1 นาที)</span><b style="font-size:26px">${d.avgAlertMin == null ? '-' : d.avgAlertMin + ' นาที'}</b></div>
        <div class="stat"><span>เวลา Close Out เฉลี่ยเดือนล่าสุด (เป้า −30%)</span><b style="font-size:26px">${last ? last.avgCloseDays + ' วัน' : '-'}</b></div>
        <div class="stat"><span>รายงานเดือนนี้ (เป้า +50%)</span><b style="font-size:26px">${curRep.reports}${repCh == null ? '' : ` <small style="font-size:15px;color:${repCh >= 0 ? '#2F4F18' : '#A02840'}">${repCh >= 0 ? '▲' : '▼'} ${Math.abs(repCh)}%</small>`}</b></div></div>
      <div class="grid">
        <div class="card"><h2>สัดส่วนประเภทปัญหา</h2><div class="row">
          <svg width="150" height="150" viewBox="0 0 100 100" role="img" aria-label="สัดส่วนประเภทปัญหา">${donut}</svg>
          <div class="legend">${d.types.slice(0, 5).map((t, i) => `<div><i style="background:${cols[i]}"></i>${esc(t.name)} ${Math.round(t.count / tot * 100)}%</div>`).join('')}</div></div></div>
        <div class="card"><h2>พื้นที่เสี่ยงสูงสุด (จำนวนเคส)</h2><div class="bars">${d.areas.map(a => `<span>${esc(a.name)}</span><i style="width:${a.count / maxA * 100}%"></i><span>${a.count}</span>`).join('')}</div></div></div>
      <div class="card"><h2>เราปิดงานเร็วขึ้นหรือไม่: เวลา Close Out เฉลี่ยรายเดือน (วัน)</h2><p>${esc(take)}</p>
        <div class="mchart">${target != null ? `<div class="target" style="bottom:${target / maxV * 166}px"><span>เป้า ${target} วัน</span></div>` : ''}
          ${mo.map((x, i) => `<div class="col ${i === 5 ? 'cur' : ''}">${x.avgCloseDays == null ? '<span class="muted">-</span>' : `<span>${x.avgCloseDays}</span><i style="height:${x.avgCloseDays / maxV * 166}px"></i>`}</div>`).join('')}</div>
        <div class="mlabels">${mo.map(x => `<span>${lab(x.key)}</span>`).join('')}</div></div>
      <div class="card"><h2>งานเลยกำหนด</h2><div class="scroll"><table><thead><tr><th>เลขที่</th><th>พื้นที่</th><th>ผู้แก้ไข</th><th>ความรุนแรง</th><th>กำหนดเสร็จ</th></tr></thead><tbody>
        ${d.overdue.length ? d.overdue.map(o => `<tr><td><a href="#/r/${esc(o.id)}">${esc(o.id)}</a></td><td>${esc(o.area)}</td><td>${esc(o.fixerEmail)}</td><td>${sevBadge(o.severity)}</td><td class="od">${fmt(o.dueDate)}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">ไม่มีงานเลยกำหนด</td></tr>'}
        </tbody></table></div></div>`;
  };
  shell(`<div class="row" style="margin-bottom:14px"><h1 style="margin-right:auto">ภาพรวมความปลอดภัย</h1>
    <select id="fa" aria-label="พื้นที่" style="width:auto"><option value="">ทุกพื้นที่</option>${m.areas.map(a => `<option>${esc(a.area)}</option>`).join('')}</select>
    <select id="fs" aria-label="ความรุนแรง" style="width:auto"><option value="">ทุกระดับ</option><option>Low</option><option>Medium</option><option>High</option></select></div>
    <div id="dd"><p class="muted">กำลังโหลด...</p></div>`);
  $('#fa').onchange = e => { area = e.target.value; load(); };
  $('#fs').onchange = e => { sev = e.target.value; load(); };
  load();
}

start();
})();
