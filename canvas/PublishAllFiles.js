(() => {
  // ===============================
  // Canvas Bulk File Publisher UI
  // ===============================

  // --- Small helper: CSRF token from cookies (Canvas requirement for PUT/POST/DELETE) ---
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

  // --- Derive course ID from URL ---
  const courseIdMatch = location.pathname.match(/\/courses\/(\d+)/);
  if (!courseIdMatch) {
    alert("Could not detect course ID from this page. Please run this from within a Canvas course.");
    return;
  }
  const COURSE_ID = courseIdMatch[1];
  const BASE = `${location.origin}/api/v1`;

  // --- UI overlay ---
  const ui = document.createElement('div');
  ui.id = 'bulk-publish-files-ui';
  ui.innerHTML = `
    <div style="
      position: fixed; inset: 0; z-index: 999999; 
      display: grid; place-items: center; 
      background: rgba(0,0,0,.35); backdrop-filter: blur(2px);
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;">
      <div style="width: min(680px, 92vw); background: #fff; border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,.2); overflow: hidden;">
        <div style="padding: 16px 18px; border-bottom: 1px solid #eee;">
          <div style="font-size: 18px; font-weight: 600;">Canvas File Publisher</div>
          <div style="font-size: 13px; color: #666;">Course ID: ${COURSE_ID}</div>
        </div>
        <div style="padding: 16px 18px;">
          <div id="bulk-status" style="font-size: 14px; margin-bottom: 10px;">Starting…</div>
          <div style="display:flex; align-items:center; gap:10px; margin: 10px 0 4px;">
            <div class="spinner" style="
              width: 18px; height: 18px; border: 3px solid #ddd; border-top-color: #3b82f6;
              border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
            <div id="bulk-phase" style="font-size: 14px;">Preparing</div>
          </div>
          <div style="height: 10px; background: #f0f0f0; border-radius: 999px; overflow: hidden; margin: 8px 0 2px;">
            <div id="bulk-bar" style="height: 100%; width: 0%; background: #3b82f6; transition: width .2s;"></div>
          </div>
          <div id="bulk-counts" style="font-size: 12px; color: #666; margin-bottom: 12px;">0 / 0</div>
          <div id="bulk-log" style="height: 180px; overflow: auto; background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 8px; font-size: 12px; line-height: 1.4;"></div>
        </div>
        <div style="display:flex; justify-content:flex-end; gap: 8px; padding: 12px 18px; border-top: 1px solid #eee;">
          <button id="bulk-cancel" style="display:none; padding: 8px 12px; border: 1px solid #ddd; border-radius: 8px; background: #fff; cursor: pointer;">Cancel</button>
          <button id="bulk-close" style="display:none; padding: 8px 12px; border: 0; border-radius: 8px; background: #16a34a; color: #fff; cursor: pointer;">Close</button>
        </div>
      </div>
    </div>
    <style>
      @keyframes spin { to { transform: rotate(360deg); } }
      .ok { color: #166534; }
      .warn { color: #92400e; }
      .err { color: #991b1b; }
      .muted { color: #6b7280; }
    </style>
  `;
  document.body.appendChild(ui);

  const $status = ui.querySelector('#bulk-status');
  const $phase  = ui.querySelector('#bulk-phase');
  const $bar    = ui.querySelector('#bulk-bar');
  const $counts = ui.querySelector('#bulk-counts');
  const $log    = ui.querySelector('#bulk-log');
  const $close  = ui.querySelector('#bulk-close');

  const log = (msg, cls = 'muted') => {
    const line = document.createElement('div');
    line.className = cls;
    line.textContent = msg;
    $log.appendChild(line);
    $log.scrollTop = $log.scrollHeight;
  };
  const setPhase = txt => { $phase.textContent = txt; };
  const setStatus = txt => { $status.textContent = txt; };
  const setProgress = (done, total) => {
    const pct = total ? Math.round((done / total) * 100) : 0;
    $bar.style.width = pct + '%';
    $counts.textContent = `${done} / ${total}`;
  };
  const finish = (msg, ok = true) => {
    setPhase('Complete');
    setStatus(msg);
    ui.querySelector('.spinner').style.display = 'none';
    $close.style.display = 'inline-block';
    $close.onclick = () => ui.remove();
  };

  // --- HTTP helpers with pagination support ---
  const CSRF = getCsrfToken();
  const jsonHeaders = { 'X-CSRF-Token': CSRF, 'Accept': 'application/json' };
  // Canvas prefers form-encoded for many writes
  const asForm = obj => new URLSearchParams(Object.entries(obj).map(([k,v]) => [k, String(v)]));

  async function apiGetAll(url) {
    // Follows Link rel="next" and aggregates all pages
    let results = [];
    let next = url.includes('?') ? url + '&per_page=100' : url + '?per_page=100';
    while (next) {
      const res = await fetch(next, { credentials: 'same-origin', headers: jsonHeaders });
      if (!res.ok) throw new Error(`GET ${next} failed ${res.status}`);
      const data = await res.json();
      results = results.concat(data);
      // Parse Link header
      const link = res.headers.get('Link');
      if (!link) { next = null; break; }
      const m = link.split(',').map(s => s.trim()).find(s => s.endsWith('rel="next"'));
      next = m ? m.slice(1, m.indexOf('>')) : null;
    }
    return results;
  }

  async function apiPut(url, bodyParams) {
    const res = await fetch(url, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { ...jsonHeaders, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: asForm(bodyParams)
    });
    if (!res.ok) {
      const t = await res.text().catch(()=> '');
      throw new Error(`PUT ${url} failed ${res.status} ${t?.slice(0,200)}`);
    }
    return res.json().catch(()=> ({}));
  }

  // --- Main flow ---
  (async () => {
    try {
      setStatus('Changing course setting: usage_rights_required = false');
      setPhase('Updating course settings');

      // 1) Disable usage rights requirement for this course
      //    PUT /api/v1/courses/:course_id/settings  with usage_rights_required=false
      await apiPut(`${BASE}/courses/${COURSE_ID}/settings`, { usage_rights_required: false });
      log('usage_rights_required disabled for this course.', 'ok');

      // 2) Unhide and unlock all folders first (so students can see files in those folders)
      setPhase('Collecting folders');
      setStatus('Listing all folders in the course');
      const folders = await apiGetAll(`${BASE}/courses/${COURSE_ID}/folders`);
      log(`Found ${folders.length} folders`);

      setPhase('Publishing folders');
      setStatus('Ensuring all folders are visible');
      let foldersDone = 0;
      for (const f of folders) {
        const needsChange = (f.hidden === true) || (f.locked === true);
        if (needsChange) {
          try {
            await apiPut(`${BASE}/folders/${f.id}`, { hidden: false, locked: false });
            log(`Folder OK: ${f.full_name || f.name || f.id}`, 'ok');
          } catch (e) {
            log(`Folder error: ${f.full_name || f.name || f.id} — ${e.message}`, 'err');
          }
        } else {
          log(`Folder already visible: ${f.full_name || f.name || f.id}`, 'muted');
        }
        foldersDone++;
        setProgress(foldersDone, folders.length || 1);
      }

      // 3) Unhide and unlock all files
      setPhase('Collecting files');
      setStatus('Listing all files in the course');
      const files = await apiGetAll(`${BASE}/courses/${COURSE_ID}/files`);
      log(`Found ${files.length} files`);

      setPhase('Publishing files');
      setStatus('Making files visible to students');
      let filesDone = 0, changed = 0, skipped = 0, errors = 0;

      for (const file of files) {
        const needsChange = (file.hidden === true) || (file.locked === true);
        if (needsChange) {
          try {
            await apiPut(`${BASE}/files/${file.id}`, { hidden: false, locked: false });
            changed++;
            log(`File OK: ${file.display_name || file.filename || file.id}`, 'ok');
          } catch (e) {
            errors++;
            log(`File error: ${file.display_name || file.filename || file.id} — ${e.message}`, 'err');
          }
        } else {
          skipped++;
          log(`File already visible: ${file.display_name || file.filename || file.id}`, 'muted');
        }
        filesDone++;
        // progress across files only for a smoother bar during the heavy step
        setProgress(filesDone, files.length || 1);
      }

      // Final summary
      log(`Folders processed: ${folders.length}`, 'ok');
      log(`Files processed: ${files.length} | changed: ${changed} | skipped: ${skipped} | errors: ${errors}`, errors ? 'warn' : 'ok');

      finish(errors ? 'Completed with some errors. Review the log.' : 'All done. Files and folders are visible.');
    } catch (err) {
      console.error(err);
      log(`Fatal error: ${err.message}`, 'err');
      finish('Stopped due to an error. See the log above.', false);
    }
  })();
})();
