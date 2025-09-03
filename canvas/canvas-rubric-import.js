(() => {
  // ===============================
  // Canvas XLSX → Multi-Rubric Builder (All-tab dry-run preview)
  // ===============================

  // CSRF
  function getCsrfToken() {
    const csrfRegex = new RegExp('^_csrf_token=(.*)$');
    let csrf;
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      const match = csrfRegex.exec(cookie);
      if (match) {
        csrf = decodeURIComponent(match[1]);
        break;
      }
    }
    return csrf;
  }

  // Course ID
  const courseIdMatch = location.pathname.match(/\/courses\/(\d+)/);
  if (!courseIdMatch) {
    alert("Could not detect course ID from this page. Run this inside a Canvas course.");
    return;
  }
  const COURSE_ID = courseIdMatch[1];
  const BASE = `${location.origin}/api/v1`;

  // Load SheetJS
  function loadSheetJS() {
    return new Promise((resolve, reject) => {
      if (window.XLSX) return resolve();
      const s = document.createElement('script');
      s.src = "https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Could not load SheetJS. Save as CSV and upload instead."));
      document.head.appendChild(s);
    });
  }

  // UI
  const overlay = document.createElement('div');
  overlay.id = 'rubricXlsxOverlay';
  overlay.innerHTML = `
    <div style="position:fixed; inset:0; background:rgba(0,0,0,0.35); z-index:99999; display:flex; align-items:center; justify-content:center;">
      <div style="background:#fff; width:min(980px, 92vw); max-height:92vh; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,0.25); overflow:hidden; display:flex; flex-direction:column;">
        <div style="padding:12px 16px; border-bottom:1px solid #eee; display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div style="font-size:18px; font-weight:600;">XLSX → Canvas Rubrics (tab names as titles)</div>
          <div style="display:flex; gap:12px; align-items:center;">
            <label title="Allow free form comments per criterion" style="font-size:14px;">
              <input id="freeFormChk" type="checkbox"> Free form comments
            </label>
            <label style="font-size:14px;">
              <input id="dryRunChk" type="checkbox" checked> Dry run preview
            </label>
          </div>
        </div>
        <div style="padding:12px 16px; display:flex; gap:16px; align-items:flex-start;">
          <div style="flex:0 0 320px;">
            <div id="dropZone" style="border:2px dashed #8a8f98; border-radius:10px; padding:18px; text-align:center; background:#fafafa;">
              <div style="font-weight:600; margin-bottom:6px;">Drag and drop .xlsx or .csv here</div>
              <div style="font-size:12px; color:#555;">Required columns: Criterion, Rating Title, Description, Points</div>
              <div style="font-size:12px; color:#555; margin-top:4px;">Optional: Criterion Description</div>
              <div style="margin-top:10px;">
                <input id="fileInput" type="file" accept=".xlsx,.xls,.csv">
              </div>
            </div>
            <div style="margin-top:10px; font-size:13px; color:#333;">
              For .xlsx, every worksheet becomes a rubric and the tab name is the title. For .csv, the file name is the title.
            </div>
            <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
              <button id="expandAllBtn" style="padding:6px 10px; border-radius:8px; border:1px solid #ccc; background:#fff;">Expand all</button>
              <button id="collapseAllBtn" style="padding:6px 10px; border-radius:8px; border:1px solid #ccc; background:#fff;">Collapse all</button>
              <button id="createAllBtn" style="padding:6px 10px; border-radius:8px; border:1px solid #ccc; background:#f4f4f4; cursor:not-allowed;" disabled>Create all rubrics</button>
              <button id="closeBtn" style="padding:6px 10px; border-radius:8px; border:1px solid #ccc; background:#fff;">Close</button>
            </div>
          </div>
          <div style="flex:1 1 auto; min-width:0;">
            <div id="preview" style="height:60vh; overflow:auto; border:1px solid #eee; border-radius:8px; padding:10px; background:#fff; font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size:13px;">
              <div style="color:#666;">Drop a file to see a per-tab preview here.</div>
            </div>
          </div>
        </div>
        <div id="spinnerRow" style="display:none; border-top:1px solid #eee; padding:10px 16px; font-size:14px; color:#333;">
          <span class="spin" style="display:inline-block; width:14px; height:14px; border:2px solid #999; border-top-color:transparent; border-radius:50%; margin-right:8px; animation:spin 0.8s linear infinite;"></span>
          Working...
        </div>
      </div>
    </div>
    <style>
      @keyframes spin { to { transform: rotate(360deg); } }
      .rubricCard { border:1px solid #ddd; border-radius:10px; margin-bottom:12px; overflow:hidden; }
      .rubricHead { padding:8px 10px; background:#f7f7f7; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center; gap:10px; }
      .rubricBody { padding:8px 10px; display:none; }
      .rubricBody.open { display:block; }
      .rubricBtn { padding:6px 10px; border-radius:8px; border:1px solid #ccc; background:#e9f6ff; cursor:pointer; }
      .rubricBtn[disabled] { background:#f4f4f4; cursor:not-allowed; }
      .mini { font-size:12px; color:#666; }
      table.rub { width:100%; border-collapse:collapse; }
      table.rub th, table.rub td { padding:6px; border-bottom:1px solid #f2f2f2; text-align:left; vertical-align:top; }
      table.rub th:last-child, table.rub td:last-child { text-align:right; white-space:nowrap; }
      .err { color:#8b0000; font-weight:600; }
      .toggleBtn { padding:4px 8px; border-radius:8px; border:1px solid #ccc; background:#fff; cursor:pointer; font-size:12px; }
    </style>
  `;
  document.body.appendChild(overlay);

  const dropZone   = overlay.querySelector('#dropZone');
  const fileInput  = overlay.querySelector('#fileInput');
  const previewEl  = overlay.querySelector('#preview');
  const freeForm   = overlay.querySelector('#freeFormChk');
  const dryRunChk  = overlay.querySelector('#dryRunChk');
  const createAll  = overlay.querySelector('#createAllBtn');
  const closeBtn   = overlay.querySelector('#closeBtn');
  const expandAll  = overlay.querySelector('#expandAllBtn');
  const collapseAll= overlay.querySelector('#collapseAllBtn');
  const spinner    = overlay.querySelector('#spinnerRow');

  let sheets = []; // [{ title, criteria, totalPoints, error }]

  function setBusy(busy) {
    spinner.style.display = busy ? 'block' : 'none';
  }

  function showToast(msg, ok = true) {
    const n = document.createElement('div');
    n.textContent = msg;
    n.style.cssText = `
      position: fixed; right: 18px; bottom: 18px; z-index: 100000;
      background: ${ok ? '#0a7d29' : '#8b0000'}; color:#fff; padding:10px 14px;
      border-radius:10px; box-shadow:0 8px 20px rgba(0,0,0,0.25);
      font-size:14px; max-width: 60vw;
    `;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 4200);
  }

  function htmlEscape(s) {
    return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }

  // Robust CSV split with quotes
  function parseCsv(text) {
    const rows = [];
    let i = 0, field = '', row = [], inQuotes = false;
    while (i < text.length) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i+1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        } else { field += ch; i++; continue; }
      } else {
        if (ch === '"') { inQuotes = true; i++; continue; }
        if (ch === ',') { row.push(field); field = ''; i++; continue; }
        if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
        if (ch === '\r') { i++; continue; }
        field += ch; i++;
      }
    }
    row.push(field);
    rows.push(row);
    return rows;
  }

  function normalizeHeader(h) {
    return String(h || '')
      .replace(/\u00A0/g, ' ')    // non-breaking space
      .trim()
      .toLowerCase();
  }

  function parseRows(rows) {
    if (!rows || !rows.length) throw new Error('Sheet has no rows.');
    const head = rows[0].map(h => String(h ?? ''));
    const lower = head.map(normalizeHeader);

    // Required columns
    const required = ['criterion','rating title','description','points'];
    const missing = required.filter(col => !lower.includes(col));
    if (missing.length) throw new Error(`Missing required column(s): ${missing.join(', ')}`);

    const mapIdx = key => lower.indexOf(key);
    const cIdx = mapIdx('criterion');
    const rIdx = mapIdx('rating title');
    const dIdx = mapIdx('description');
    const pIdx = mapIdx('points');
    const cdIdx = mapIdx('criterion description'); // optional

    const items = rows.slice(1).filter(r => Array.isArray(r) && r.some(x => String(x ?? '').trim() !== ''));

    // Group by Criterion
    const byCrit = new Map();
    const critDescMap = new Map(); // capture first non-empty criterion long description if provided
    for (const r of items) {
      const crit = String(r[cIdx] ?? '').trim();
      const ratingTitle = String(r[rIdx] ?? '').trim();
      const desc = String(r[dIdx] ?? '').trim();
      const ptsRaw = String(r[pIdx] ?? '').trim();
      const pts = Number(ptsRaw.replace(/[^0-9.\-]/g, ''));
      if (!crit) continue;
      if (!byCrit.has(crit)) byCrit.set(crit, []);
      byCrit.get(crit).push({ ratingTitle, desc, pts: Number.isFinite(pts) ? pts : 0 });

      if (cdIdx >= 0) {
        const cdesc = String(r[cdIdx] ?? '').trim();
        if (cdesc && !critDescMap.has(crit)) critDescMap.set(crit, cdesc);
      }
    }

    if (!byCrit.size) throw new Error('No rubric rows found after headers.');

    const criteria = [];
    for (const [crit, ratings] of byCrit.entries()) {
      const maxPts = ratings.reduce((m, rr) => Math.max(m, rr.pts), 0);
      criteria.push({
        description: crit,
        long_description: critDescMap.get(crit) || '',
        points: maxPts,
        ratings: ratings.map(r => ({
          description: r.ratingTitle || 'Rating',
          long_description: r.desc || '',
          points: r.pts
        }))
      });
    }

    const totalPoints = criteria.reduce((s, c) => s + (Number(c.points) || 0), 0);
    return { criteria, totalPoints };
  }

  function renderPreview() {
    if (!sheets.length) {
      previewEl.innerHTML = `<div style="color:#666;">Drop a file to see a per-tab preview here.</div>`;
      createAll.disabled = true;
      createAll.style.cursor = 'not-allowed';
      createAll.style.background = '#f4f4f4';
      createAll.style.borderColor = '#ccc';
      return;
    }
    let html = '';
    sheets.forEach((s, idx) => {
      html += `
        <div class="rubricCard" data-index="${idx}">
          <div class="rubricHead">
            <div>
              <div style="font-weight:600;">${htmlEscape(s.title)}</div>
              <div class="mini">${s.error ? '<span class="err">Error in this tab</span>' : `Criteria: ${s.criteria.length} | Total points: ${s.totalPoints}`}</div>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              <button class="toggleBtn" data-index="${idx}">Toggle</button>
              <button class="oneCreate rubricBtn" data-index="${idx}" ${dryRunChk.checked || s.error ? 'disabled' : ''}>Create this rubric</button>
            </div>
          </div>
          <div class="rubricBody ${idx === 0 ? 'open' : ''}">
            ${s.error ? `<div class="err">${htmlEscape(s.error)}</div>` : `
              ${s.criteria.map(c => `
                <div style="border:1px solid #eee; border-radius:8px; margin-bottom:10px;">
                  <div style="padding:8px 10px; font-weight:600; background:#fafafa; border-bottom:1px solid #eee;">
                    ${htmlEscape(c.description)} <span style="font-weight:400; color:#666;">(criterion points: ${c.points})</span>
                  </div>
                  <div style="padding:8px 10px;">
                    ${c.long_description ? `<div style="margin-bottom:8px; color:#555;">${htmlEscape(c.long_description)}</div>` : ''}
                    <table class="rub">
                      <thead>
                        <tr><th>Rating</th><th>Description</th><th>Points</th></tr>
                      </thead>
                      <tbody>
                        ${c.ratings.map(r => `
                          <tr>
                            <td>${htmlEscape(r.description)}</td>
                            <td>${htmlEscape(r.long_description)}</td>
                            <td>${r.points}</td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>
                </div>
              `).join('')}
            `}
          </div>
        </div>
      `;
    });
    previewEl.innerHTML = html;

    // Buttons state
    const anyOk = sheets.some(s => !s.error);
    createAll.disabled = dryRunChk.checked || !anyOk;
    createAll.style.cursor = createAll.disabled ? 'not-allowed' : 'pointer';
    createAll.style.background = createAll.disabled ? '#f4f4f4' : '#e9f6ff';
    createAll.style.borderColor = createAll.disabled ? '#ccc' : '#9ed0ff';

    // Wire up toggles and per-sheet create
    previewEl.querySelectorAll('.toggleBtn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const i = Number(e.currentTarget.getAttribute('data-index'));
        const card = previewEl.querySelector(`.rubricCard[data-index="${i}"] .rubricBody`);
        if (card) card.classList.toggle('open');
      });
    });

    previewEl.querySelectorAll('.oneCreate').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const i = Number(e.currentTarget.getAttribute('data-index'));
        const sheetObj = sheets[i];
        if (!sheetObj || sheetObj.error) return;
        await createRubric(sheetObj);
      });
    });
  }

  async function handleFile(file) {
    setBusy(true);
    sheets = [];
    try {
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        await loadSheetJS();
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf);
        wb.SheetNames.forEach(name => {
          try {
            const ws = wb.Sheets[name];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
            if (!rows || !rows.length) throw new Error('Sheet is empty.');
            const { criteria, totalPoints } = parseRows(rows);
            sheets.push({ title: String(name).trim() || 'Untitled Rubric', criteria, totalPoints });
          } catch (e) {
            sheets.push({ title: String(name).trim() || 'Untitled Rubric', criteria: [], totalPoints: 0, error: e.message || String(e) });
          }
        });
        if (!sheets.length) throw new Error('Workbook has no readable sheets.');
        showToast(`Parsed ${sheets.length} tab${sheets.length > 1 ? 's' : ''}.`);
      } else if (/\.csv$/i.test(file.name)) {
        const text = await file.text();
        const rows = parseCsv(text);
        const { criteria, totalPoints } = parseRows(rows);
        const baseName = file.name.replace(/\.[^/.]+$/, '');
        sheets.push({ title: baseName || 'Imported Rubric', criteria, totalPoints });
        showToast('Parsed 1 rubric from CSV.');
      } else {
        throw new Error("Unsupported file type. Upload .xlsx, .xls, or .csv.");
      }
    } catch (err) {
      sheets = [];
      showToast(err.message || String(err), false);
    } finally {
      setBusy(false);
      renderPreview();
      if (dryRunChk.checked) showToast("Dry run ready. Uncheck to enable creation.", true);
    }
  }

  async function createRubric(sheetObj) {
    if (!sheetObj || sheetObj.error) return false;
    if (dryRunChk.checked) { showToast('Dry run is on. Uncheck to create.', false); return false; }
    const csrf = getCsrfToken();
    const fd = new FormData();
    fd.append('rubric[title]', sheetObj.title);
    fd.append('rubric[free_form_criterion_comments]', freeForm.checked ? '1' : '0');
    sheetObj.criteria.forEach((c, i) => {
      fd.append(`rubric[criteria][${i}][description]`, c.description);
      fd.append(`rubric[criteria][${i}][long_description]`, c.long_description || '');
      fd.append(`rubric[criteria][${i}][points]`, String(c.points));
      c.ratings.forEach((r, j) => {
        fd.append(`rubric[criteria][${i}][ratings][${j}][description]`, r.description);
        fd.append(`rubric[criteria][${i}][ratings][${j}][long_description]`, r.long_description || '');
        fd.append(`rubric[criteria][${i}][ratings][${j}][points]`, String(r.points));
      });
    });
    fd.append('rubric_association[association_type]', 'Course');
    fd.append('rubric_association[association_id]', COURSE_ID);
    fd.append('rubric_association[use_for_grading]', '1');

    setBusy(true);
    try {
      const res = await fetch(`${BASE}/courses/${COURSE_ID}/rubrics`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrf },
        body: fd
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Canvas API error: ${res.status} ${res.statusText} — ${t}`);
      }
      await res.json();
      showToast(`Rubric "${sheetObj.title}" created.`);
      return true;
    } catch (err) {
      showToast(err.message || String(err), false);
      alert(`Failed to create rubric "${sheetObj.title}":\n${err.message || String(err)}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createAllRubrics() {
    if (dryRunChk.checked) { showToast('Dry run is on. Uncheck to create.', false); return; }
    const creatables = sheets.filter(s => !s.error);
    if (!creatables.length) { showToast('No valid tabs to create.', false); return; }
    setBusy(true);
    let ok = 0;
    for (const s of creatables) {
      const success = await createRubric(s);
      if (success) ok++;
    }
    setBusy(false);
    const link = `${location.origin}/courses/${COURSE_ID}/rubrics`;
    alert(`Created ${ok}/${creatables.length} rubric(s).\n\nView rubrics: ${link}`);
    window.open(link, '_blank');
  }

  // Events
  ;['dragenter','dragover'].forEach(evt => {
    dropZone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); dropZone.style.background = '#eef6ff'; });
  });
  ;['dragleave','drop'].forEach(evt => {
    dropZone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); dropZone.style.background = '#fafafa'; });
  });
  dropZone.addEventListener('drop', e => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  fileInput.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) handleFile(f);
  });

  expandAll.addEventListener('click', () => {
    previewEl.querySelectorAll('.rubricBody').forEach(b => b.classList.add('open'));
  });
  collapseAll.addEventListener('click', () => {
    previewEl.querySelectorAll('.rubricBody').forEach(b => b.classList.remove('open'));
  });

  closeBtn.addEventListener('click', () => overlay.remove());
  dryRunChk.addEventListener('change', () => renderPreview());
  createAll.addEventListener('click', () => createAllRubrics());
})();
