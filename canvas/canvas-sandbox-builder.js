// Cleanup if anything is stuck
document.querySelectorAll('.csb-modal').forEach(m => m.remove());

(() => {
// ===== Canvas Sandbox Builder v1.9.2 (safe strings) =====

// --- CSRF helper ---
function getCsrfToken() {
  const re = new RegExp('^_csrf_token=(.*)$');
  let csrf;
  const cookies = document.cookie.split(';');
  for (let i = 0; i < cookies.length; i++) {
    const c = cookies[i].trim();
    const m = re.exec(c);
    if (m) { csrf = decodeURIComponent(m[1]); break; }
  }
  return csrf;
}

const API_BASE = location.origin + '/api/v1';
const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() };

// ---------- utils ----------
function el(tag, attrs, children) {
  const n = document.createElement(tag);
  attrs = attrs || {};
  Object.keys(attrs).forEach(k => {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'style') n.style.cssText = attrs[k];
    else n.setAttribute(k, attrs[k]);
  });
  if (children != null) {
    const arr = Array.isArray(children) ? children : [children];
    arr.forEach(c => {
      if (c == null) return;
      if (typeof c === 'string') n.insertAdjacentHTML('beforeend', c);
      else n.appendChild(c);
    });
  }
  return n;
}
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function parseLinkHeader(h) {
  if (!h) return {};
  return h.split(',').reduce((a,p) => {
    const m = p.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (m) a[m[2]] = m[1];
    return a;
  }, {});
}
async function fetchPaged(url) {
  const out = [];
  let next = url;
  while (next) {
    const r = await fetch(next, { headers });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' on ' + next);
    const data = await r.json();
    out.push.apply(out, data);
    const L = parseLinkHeader(r.headers.get('Link'));
    next = L.next || null;
  }
  return out;
}
async function getRootAccounts(){ return fetchPaged(API_BASE + '/accounts?per_page=100'); }
async function getSubaccountsRecursive(id){ return fetchPaged(API_BASE + '/accounts/' + id + '/sub_accounts?recursive=true&per_page=100'); }
async function getEnrollmentTerms(id){
  const r = await fetch(API_BASE + '/accounts/' + id + '/terms?per_page=100', { headers });
  if (!r.ok) throw new Error('Failed to load terms for account ' + id);
  const d = await r.json();
  return (d.enrollment_terms || []).sort((a,b) => a.name.localeCompare(b.name));
}
async function findUsersBySearchTerm(term){
  return fetchPaged(API_BASE + '/accounts/self/users?search_term=' + encodeURIComponent(term) + '&per_page=50');
}
async function duplicateCheck(accountId, name, code){
  const q = encodeURIComponent((code || name).slice(0,60));
  const url = API_BASE + '/accounts/' + accountId + '/courses?search_term=' + q + '&per_page=100&with_enrollments=false&include[]=course_code';
  try{
    const res = await fetchPaged(url);
    const nm = res.find(c => c.name && name && c.name.trim().toLowerCase() === name.trim().toLowerCase());
    const cd = res.find(c => c.course_code && code && c.course_code.trim().toLowerCase() === code.trim().toLowerCase());
    return { byName: nm || null, byCode: cd || null };
  } catch {
    return { byName: null, byCode: null };
  }
}
async function createCourse(accountId, payload){
  const r = await fetch(API_BASE + '/accounts/' + accountId + '/courses', {
    method: 'POST', headers, body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error('Create failed: HTTP ' + r.status + '. ' + await r.text());
  return r.json();
}
async function enrollTeacher(courseId, who, notify){
  if (notify == null) notify = true;
  let id = null;
  if (/^\d+$/.test(who)) id = who;
  else if (/^sis_user_id:/.test(who)) id = who;
  else {
    const hits = await findUsersBySearchTerm(who);
    if (!hits.length) throw new Error('No user found for "' + who + '"');
    const exact = hits.find(u => (u.email || u.login_id || '').toLowerCase() === String(who).toLowerCase());
    id = (exact || hits[0]).id;
  }
  const r = await fetch(API_BASE + '/courses/' + courseId + '/enrollments', {
    method: 'POST', headers, body: JSON.stringify({
      enrollment: { user_id: id, type: 'TeacherEnrollment', enrollment_state: 'active', notify: notify }
    })
  });
  if (!r.ok) throw new Error('Enroll failed: HTTP ' + r.status + '. ' + await r.text());
  return r.json();
}

// ---------- naming ----------
function deriveLastName(input){
  if (!input) return '';
  var raw = String(input).trim();
  if (raw.indexOf('@') !== -1) {
    raw = raw.split('@')[0];
    var pieces = raw.split(/[._\s-]+/);
    raw = pieces[pieces.length - 1];
  } else if (/\s/.test(raw)) {
    var p = raw.split(/\s+/);
    raw = p[p.length - 1];
  }
  return raw.replace(/[^A-Za-z]/g, '').toUpperCase();
}
function parseCourseParts(base){
  var s = String(base || '').trim();
  var subj = (s.match(/[A-Za-z]+/) || [''])[0].toUpperCase();
  var num  = (s.match(/\d{1,4}/) || [''])[0];
  return { SUBJ: subj, NUM: num };
}
function compactKey(SUBJ, NUM, noSpace){
  if (!SUBJ && !NUM) return '';
  return noSpace ? (SUBJ + NUM) : (SUBJ + (NUM ? ' ' + NUM : ''));
}
function applyTemplate(tpl, vars){
  var out = String(tpl || '')
    .replace(/{{\s*KEY\s*}}/g, vars.KEY || '')
    .replace(/{{\s*SUBJ\s*}}/g, vars.SUBJ || '')
    .replace(/{{\s*NUM\s*}}/g,  vars.NUM || '')
    .replace(/{{\s*LAST\s*}}/g, vars.LAST || '');
  out = out.replace(/\s+/g,' ').replace(/-+/g,'-').replace(/\s*-\s*/g,'-').replace(/-$/,'').trim();
  return out;
}
function sanitizeCourseCode(t){ return String(t || '').replace(/[^A-Za-z0-9\-_\.]/g,'').slice(0,50); }

// ---------- UI ----------
function buildOverlay(){
  var css = [
    '.csb-modal{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483647}',
    '.csb-panel{position:fixed;left:50%;top:10vh;transform:translateX(-50%);width:min(960px,92vw);max-height:82vh;overflow:auto;background:#fff;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.25);font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}',
    '.csb-hdr{padding:14px 18px;border-bottom:1px solid #e6e6e6;display:flex;align-items:center;justify-content:space-between}',
    '.csb-title{font-size:18px;font-weight:600}',
    '.csb-body{padding:16px 18px 6px 18px}',
    '.csb-row{display:grid;grid-template-columns:200px 1fr;gap:10px;align-items:center;margin:8px 0}',
    '.csb-input,.csb-select,.csb-textarea{width:100%;padding:8px 10px;border:1px solid #d0d0d0;border-radius:8px;font-size:14px}',
    '.csb-textarea{min-height:110px;resize:vertical}',
    '.csb-preflight{background:#fafafa;border:1px solid #eee;border-radius:10px;padding:8px 10px;max-height:220px;overflow:auto}',
    '.csb-hidden{display:none}',
    '.csb-progress{height:8px;background:#eee;border-radius:999px;overflow:hidden}',
    '.csb-bar{height:8px;width:0%;background:#1f6feb}',
    '.csb-log{background:#111;color:#eee;border-radius:8px;padding:8px 10px;max-height:160px;overflow:auto;font-size:12px}',
    '.csb-btn{padding:9px 14px;border-radius:10px;border:1px solid #cfcfcf;background:#f7f7f7;cursor:pointer}',
    '.csb-btn.primary{background:#1f6feb;color:#fff;border-color:#1f6feb}',
    '.csb-small{font-size:12px;color:#666}',
    '.csb-badge{display:inline-block;padding:2px 8px;border:1px solid #ddd;border-radius:999px;background:#f6f8fa;font-size:12px;margin-right:6px}'
  ].join('\n');

  var style = el('style', {}, []);
  style.textContent = css;

  var modal = el('div', { class: 'csb-modal' });
  var panel = el('div', { class: 'csb-panel' });

  var header = el('div', { class: 'csb-hdr' }, [
    el('div', { class: 'csb-title' }, 'Canvas Sandbox Builder'),
    el('div', {}, el('button', { class: 'csb-btn', id: 'csb-close' }, 'Close'))
  ]);

  var body = el('div', { class: 'csb-body' });

  var acctRow = el('div', { class: 'csb-row' }, [
    el('label', {}, 'Account'),
    el('div', {}, [
      el('div', { style: 'display:flex;gap:10px;align-items:center' }, [
        el('select', { class: 'csb-select', id: 'csb-account' }),
        el('button', { class: 'csb-btn', id: 'csb-scan' }, 'Find Dev/Sandbox')
      ]),
      el('div', { class: 'csb-small' }, 'Pick your Sandbox sub-account.')
    ])
  ]);

  var termRow = el('div', { class: 'csb-row' }, [
    el('label', {}, 'Term'),
    el('div', {}, el('select', { class: 'csb-select', id: 'csb-term' }, el('option', { value: '' }, '(No specific term)')))
  ]);

  var teachRow = el('div', { class: 'csb-row' }, [
    el('label', {}, 'Also enroll teacher'),
    el('div', {}, [
      el('input', { class: 'csb-input', id: 'csb-teacher', placeholder: 'Optional: Canvas ID, SIS user, or email/name' }),
      el('div', { class: 'csb-small' }, 'Last name is used in naming unless you override per line.')
    ])
  ]);

  var titlesRow = el('div', { class: 'csb-row' }, [
    el('label', {}, 'Course input'),
    el('div', {}, [
      el('textarea', { class: 'csb-textarea', id: 'csb-titles', placeholder: 'One per line, like AUT 101' }),
      el('div', { class: 'csb-small' }, 'Per line: "Title | CODE" or "AUT 101 || lloyd.adams@eac.edu".')
    ])
  ]);

  var templatesTitle = el('div', { class: 'csb-row' }, [
    el('label', {}, 'Title template'),
    el('div', {}, [
      el('input', { class: 'csb-input', id: 'csb-title-tpl', value: '{{KEY}} SANDBOX {{LAST}}' }),
    el('div', { class: 'csb-small' }, 'Tokens: {{KEY}} AUT101, {{SUBJ}} AUT, {{NUM}} 101, {{LAST}} ADAMS')
    ])
  ]);

  var templatesCode = el('div', { class: 'csb-row' }, [
    el('label', {}, 'Course code template'),
    el('div', {}, el('input', { class: 'csb-input', id: 'csb-code-tpl', value: '{{KEY}}-SB-{{LAST}}' }))
  ]);

  var keyRow = el('div', { class: 'csb-row' }, [
    el('label', {}, 'Course key style'),
    el('div', {}, el('label', { class: 'csb-small' }, [
      el('input', { type: 'checkbox', id: 'csb-nospace', checked: '' }),
      document.createTextNode(' Use AUT101 (no space)')
    ]))
  ]);

  var preflight = el('div', {}, [
    el('div', { style: 'margin:8px 0;font-weight:600' }, 'Preflight'),
    el('div', { id: 'csb-preflight', class: 'csb-preflight' }, 'Nothing to show yet'),
    el('div', {}, [
      el('button', { class: 'csb-btn', id: 'csb-preview' }, 'Build Preview'),
      el('button', { class: 'csb-btn primary', id: 'csb-create', disabled: '' }, 'Create Courses')
    ])
  ]);

  var progress = el('div', { id: 'csb-progress-wrap', class: 'csb-hidden' }, [
    el('div', { style: 'display:flex;align-items:center;gap:10px;margin:10px 0' }, [
      el('span', { class: 'csb-badge', id: 'csb-step' }, 'Ready'),
      el('div', { class: 'csb-progress', style: 'flex:1' }, el('div', { class: 'csb-bar', id: 'csb-bar' }))
    ]),
    el('div', { class: 'csb-log', id: 'csb-log' })
  ]);

  var doneBlock = el('div', { id: 'csb-done', class: 'csb-hidden' }, [
    el('div', { style: 'margin-top:10px;font-weight:600' }, 'Created'),
    el('div', { id: 'csb-summary' }),
    el('div', {}, [
      el('button', { class: 'csb-btn', id: 'csb-copy' }, 'Copy Summary'),
      el('button', { class: 'csb-btn', id: 'csb-open' }, 'Open All in Tabs'),
      el('button', { class: 'csb-btn', id: 'csb-download' }, 'Download .txt')
    ])
  ]);

  body.appendChild(acctRow);
  body.appendChild(termRow);
  body.appendChild(teachRow);
  body.appendChild(titlesRow);
  body.appendChild(templatesTitle);
  body.appendChild(templatesCode);
  body.appendChild(keyRow);
  body.appendChild(preflight);
  body.appendChild(progress);
  body.appendChild(doneBlock);

  var foot = el('div', { class: 'csb-hdr' }, el('span', { class: 'csb-small' }, 'API: ' + API_BASE));

  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(foot);

  modal.appendChild(panel);
  document.head.appendChild(style);
  document.body.appendChild(modal);

  return {
    modal: modal,
    els: {
      accountSel: panel.querySelector('#csb-account'),
      scanBtn: panel.querySelector('#csb-scan'),
      termSel: panel.querySelector('#csb-term'),
      teacherInput: panel.querySelector('#csb-teacher'),
      titles: panel.querySelector('#csb-titles'),
      titleTpl: panel.querySelector('#csb-title-tpl'),
      codeTpl: panel.querySelector('#csb-code-tpl'),
      noSpace: panel.querySelector('#csb-nospace'),
      preflight: panel.querySelector('#csb-preflight'),
      previewBtn: panel.querySelector('#csb-preview'),
      createBtn: panel.querySelector('#csb-create'),
      progressWrap: panel.querySelector('#csb-progress-wrap'),
      step: panel.querySelector('#csb-step'),
      bar: panel.querySelector('#csb-bar'),
      log: panel.querySelector('#csb-log'),
      done: panel.querySelector('#csb-done'),
      summary: panel.querySelector('#csb-summary'),
      copyBtn: panel.querySelector('#csb-copy'),
      openBtn: panel.querySelector('#csb-open'),
      dlBtn: panel.querySelector('#csb-download'),
      closeBtn: panel.querySelector('#csb-close')
    }
  };
}

// ---------- main ----------
(async function main(){
  let ui;
  try { ui = buildOverlay(); }
  catch(e){
    const m = document.createElement('div');
    m.style.position='fixed'; m.style.left='0'; m.style.right='0'; m.style.bottom='0';
    m.style.zIndex='2147483647'; m.style.background='#b42318'; m.style.color='#fff';
    m.style.padding='8px 12px'; m.style.fontFamily='monospace';
    m.textContent='UI init error: ' + e.message;
    document.body.appendChild(m);
    return;
  }

  const els = ui.els;

  // prefs
  const PREF='csb_safe_v192';
  function savePrefs(){
    try{ localStorage.setItem(PREF, JSON.stringify({
      accountId: els.accountSel.value || '',
      termId: els.termSel.value || '',
      teacher: els.teacherInput.value || '',
      titleTpl: els.titleTpl.value || '',
      codeTpl: els.codeTpl.value || '',
      noSpace: !!els.noSpace.checked
    })); } catch {}
  }
  function loadPrefs(){
    try { return JSON.parse(localStorage.getItem(PREF) || '{}'); } catch { return {}; }
  }

  function setProgress(t,p){ els.step.textContent = t; els.bar.style.width = Math.max(0,Math.min(100,p)) + '%'; }
  function logLine(m){ els.log.textContent += (els.log.textContent ? '\n' : '') + m; els.log.scrollTop = els.log.scrollHeight; }

  async function refreshTerms(saved){
    const accountId = els.accountSel.value;
    els.termSel.innerHTML = '';
    els.termSel.appendChild(el('option', { value:'' }, '(No specific term)'));
    if (!accountId) return;
    try{
      const terms = await getEnrollmentTerms(accountId);
      terms.forEach(t => els.termSel.appendChild(el('option', { value:String(t.id) }, t.name)));
      if (saved && [].some.call(els.termSel.options, o => o.value === String(saved))) els.termSel.value = String(saved);
    }catch{}
  }

  async function loadAccounts(){
    els.accountSel.innerHTML = '<option value="">Loading accounts…</option>';
    const roots = await getRootAccounts();
    els.accountSel.innerHTML = roots.map(r => '<option value="'+r.id+'">'+(r.name || ('Account '+r.id))+' (id '+r.id+')</option>').join('');
    const saved = loadPrefs();
    if (saved.accountId && [].some.call(els.accountSel.options, o => o.value === String(saved.accountId))) {
      els.accountSel.value = String(saved.accountId);
    }
    if (saved.teacher) els.teacherInput.value = saved.teacher;
    if (saved.titleTpl) els.titleTpl.value = saved.titleTpl;
    if (saved.codeTpl) els.codeTpl.value = saved.codeTpl;
    if (typeof saved.noSpace === 'boolean') els.noSpace.checked = saved.noSpace;
    await refreshTerms(saved.termId || '');
  }

  async function runFinder(){
    const rootId = els.accountSel.value; if (!rootId) return;
    els.scanBtn.disabled = true; els.scanBtn.textContent = 'Scanning…';
    try {
      const subs = await getSubaccountsRecursive(rootId);
      const hit = subs.find(s => /sandbox|development|dev/i.test(s.name || ''));
      if (hit) {
        const exists = [].some.call(els.accountSel.options, o => o.value === String(hit.id));
        if (!exists) els.accountSel.appendChild(el('option', { value:String(hit.id) }, hit.name + ' (sub ' + hit.id + ')'));
        els.accountSel.value = String(hit.id);
        await refreshTerms();
        savePrefs();
      } else {
        alert('No obvious Development or Sandbox sub-account found.');
      }
    } catch {
      alert('Failed to scan sub-accounts.');
    } finally {
      els.scanBtn.disabled = false; els.scanBtn.textContent = 'Find Dev/Sandbox';
    }
  }

  function parseOneLine(raw, globalTeacher, titleTpl, codeTpl, noSpace){
    var line = String(raw).trim(), teacherOverride = null;
    if (line.indexOf('||') !== -1) {
      var parts = line.split('||');
      line = parts[0].trim();
      teacherOverride = (parts[1] || '').trim();
    }
    if (line.indexOf('|') !== -1) {
      var split = line.split('|');
      var t = split[0].trim(), c = (split[1] || '').trim();
      return { name: t, code: sanitizeCourseCode(c), teacherUsed: teacherOverride || globalTeacher || '' };
    }
    var cp = parseCourseParts(line);
    var KEY = compactKey(cp.SUBJ, cp.NUM, noSpace);
    var LAST = deriveLastName(teacherOverride || globalTeacher || '');
    var name = applyTemplate(titleTpl, { KEY: KEY, SUBJ: cp.SUBJ, NUM: cp.NUM, LAST: LAST });
    var code = applyTemplate(codeTpl, { KEY: KEY, SUBJ: cp.SUBJ, NUM: cp.NUM, LAST: LAST });
    code = sanitizeCourseCode(code || KEY);
    return { name: name, code: code, teacherUsed: teacherOverride || globalTeacher || '' };
  }
  function parseLines(){
    var lines = String(els.titles.value || '').split(/\r?\n/).map(function(s){return s.trim();}).filter(Boolean);
    var g = els.teacherInput.value.trim();
    var titleTpl = els.titleTpl.value || '{{KEY}} SANDBOX {{LAST}}';
    var codeTpl  = els.codeTpl.value  || '{{KEY}}-SB-{{LAST}}';
    var noSpace  = !!els.noSpace.checked;
    return lines.map(function(line){ return parseOneLine(line, g, titleTpl, codeTpl, noSpace); });
  }

  async function buildPreview(){
    const accountId = els.accountSel.value;
    if (!accountId) return alert('Pick an account.');
    const items = parseLines();
    if (!items.length) return alert('Add at least one line.');
    els.preflight.innerHTML = 'Checking for duplicates…';
    els.createBtn.disabled = true;

    const results = [];
    for (const it of items) {
      const dup = await duplicateCheck(accountId, it.name, it.code);
      results.push({ name: it.name, code: it.code, teacherUsed: it.teacherUsed, dupName: dup.byName || null, dupCode: dup.byCode || null });
    }

    els.preflight.innerHTML = results.map(function(r){
      var flags = [];
      if (r.dupName) flags.push('<span class="csb-badge">Name exists</span>');
      if (r.dupCode) flags.push('<span class="csb-badge">Code exists</span>');
      return '<div style="padding:6px 0;border-bottom:1px dashed #eee;">'
           + '<div><strong>' + r.name + '</strong></div>'
           + '<div class="csb-small">code: <code>' + (r.code || '(none)') + '</code> ' + flags.join(' ') + '</div>'
           + '</div>';
    }).join('') || 'Nothing to show.';

    const blocked = results.some(function(r){ return r.dupName || r.dupCode; });
    els.createBtn.disabled = blocked;
    if (blocked) {
      var n = el('div', { class: 'csb-small', style: 'color:#b42318;margin-top:8px' }, 'Duplicates found. Adjust overrides or templates, then rebuild preview.');
      els.preflight.appendChild(n);
    }
    savePrefs();
    return results;
  }

  async function createAll(){
    const accountId = els.accountSel.value, termId = els.termSel.value, items = parseLines();
    if (!items.length) return alert('Add at least one line.');
    if (!confirm('Create ' + items.length + ' course(s) now?')) return;

    els.progressWrap.classList.remove('csb-hidden');
    els.done.classList.add('csb-hidden');
    els.log.textContent = '';
    setProgress('Starting', 0);

    const created = [];
    let i = 0;
    for (const it of items) {
      i += 1;
      setProgress('Creating ' + i + ' of ' + items.length, Math.round(((i - 1) / items.length) * 100));
      try {
        const payload = { course: {
          name: it.name,
          course_code: it.code || undefined,
          is_public: false,
          default_view: 'modules',
          restrict_enrollments_to_course_dates: false,
          term_id: termId || undefined
        }};
        const c = await createCourse(accountId, payload);
        const url = location.origin + '/courses/' + c.id;
        created.push({ name: c.name, id: c.id, code: c.course_code, url: url });
        logLine('Created: ' + c.name + ' -> ' + url);

        if (it.teacherUsed) {
          try { await enrollTeacher(c.id, it.teacherUsed, true); logLine('Enrolled "' + it.teacherUsed + '" as Teacher'); }
          catch (e) { logLine('Enroll error: ' + e.message); }
        }
      } catch (e) {
        logLine('Create error for "' + it.name + '": ' + e.message);
      }
      await sleep(200);
    }

    setProgress('Done', 100);
    els.summary.innerHTML = created.length
      ? created.map(function(c){ return '<div><strong>' + c.name + '</strong>: <a href="' + c.url + '" target="_blank" rel="noopener">' + c.url + '</a></div>'; }).join('')
      : '<div class="csb-small">No courses created.</div>';
    els.done.classList.remove('csb-hidden');

    els.copyBtn.onclick = async function(){
      const text = created.map(c => c.name + ': ' + c.url).join('\n');
      const htmlList = created.map(c => '<div><strong>' + c.name + '</strong>: <a href="' + c.url + '">' + c.url + '</a></div>').join('');
      try{
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([new ClipboardItem({
            'text/plain': new Blob([text], { type: 'text/plain' }),
            'text/html':  new Blob([htmlList], { type: 'text/html' })
          })]);
        } else {
          const ta = el('textarea', { style: 'position:fixed;left:-9999px;top:-9999px' }, text);
          document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
        }
        alert('Summary copied.');
      } catch {
        alert('Copy failed. You can select and copy the list manually.');
      }
    };
    els.openBtn.onclick = function(){ created.forEach(c => window.open(c.url, '_blank')); };
    els.dlBtn.onclick = function(){
      const blob = new Blob([created.map(c => c.name + ': ' + c.url).join('\n')], { type: 'text/plain' });
      const a = el('a', { href: URL.createObjectURL(blob), download: 'sandbox-courses.txt' });
      document.body.appendChild(a); a.click(); a.remove();
    };

    savePrefs();
  }

  // wire up
  await loadAccounts();
  ['#csb-teacher','#csb-title-tpl','#csb-code-tpl','#csb-nospace'].forEach(sel => {
    const n = document.querySelector(sel);
    if (!n) return;
    n.addEventListener('input', savePrefs);
    n.addEventListener('change', savePrefs);
  });
  els.accountSel.addEventListener('change', function(){ refreshTerms(); savePrefs(); });
  els.termSel.addEventListener('change', savePrefs);
  els.scanBtn.addEventListener('click', runFinder);
  els.previewBtn.addEventListener('click', buildPreview);
  els.createBtn.addEventListener('click', createAll);
  els.closeBtn.addEventListener('click', function(){ ui.modal.remove(); });

  if (!els.titles.value.trim()) {
    els.titles.placeholder = ['AUT 101', 'HCE 304', 'HHP 100'].join('\n');
  }
})().catch(function(e){
  const m = document.createElement('div');
  m.style.position='fixed'; m.style.left='0'; m.style.right='0'; m.style.bottom='0';
  m.style.zIndex='2147483647'; m.style.background='#b42318'; m.style.color='#fff';
  m.style.padding='8px 12px'; m.style.fontFamily='monospace';
  m.textContent='Sandbox Builder fatal error: ' + e.message;
  document.body.appendChild(m);
});
})();
