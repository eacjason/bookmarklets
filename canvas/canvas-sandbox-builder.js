/* Canvas Sandbox‑Builder v1.7
 * – duplicate guard
 * – spinner + finish popup
 * – graceful per‑course error handling
 * – Close button
 * – clickable summary links
 * – Copy button writes text/plain (\r\n) and text/html (<br>) so Outlook keeps breaks
 */

(async () => {

  /* ---------- utility helpers ---------- */
  function getCsrfToken() {
    const m = document.cookie.split(';').find(c => /^_csrf_token=/.test(c.trim()));
    return m ? decodeURIComponent(m.trim().split('=')[1]) : '';
  }
  function getAccountId() {
    const path = /\/accounts\/(\d+)/.exec(location.pathname);
    if (path) return path[1];
    const qp = new URL(location.href).searchParams.get('account_id');
    if (qp) return qp;
    throw new Error('Browse to a Canvas account (Admin > Account) before running the script.');
  }
  async function canvasFetch(endpoint, opts = {}) {
    const res = await fetch(`${origin}/api/v1${endpoint}`, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json','X-CSRF-Token': getCsrfToken() },
      ...opts
    });
    if (!res.ok) throw new Error(`Canvas ${res.status}: ${await res.text()}`);
    return res.json();
  }

  /* ---------- build modal UI ---------- */
  const modal = document.createElement('div');
  modal.innerHTML = `
    <style>
      .sbx-back {position:fixed;inset:0;background:#0008;
                 display:flex;align-items:center;justify-content:center;
                 z-index:9999;font-family:system-ui,sans-serif}
      .sbx-wrap {background:#fff;padding:1rem 1.25rem;border-radius:6px;
                 max-width:560px;width:100%;box-shadow:0 4px 12px #0004;
                 position:relative}
      .sbx-wrap h2{margin:.25rem 0 .75rem;font-size:1.25rem}
      .sbx-wrap textarea,.sbx-wrap input{width:100%;margin-bottom:.5rem;padding:.35rem}
      .sbx-log{height:110px;overflow-y:auto;border:1px solid #ccc;
               background:#f9f9f9;font-size:.85rem;white-space:pre-wrap;padding:.4rem}
      .sbx-sum{height:95px;overflow-y:auto;border:1px solid #ccc;
               background:#eef;font-size:.85rem;padding:.4rem}
      .sbx-btn{margin-top:.25rem;padding:.4rem .8rem;cursor:pointer}
      .sbx-close{position:absolute;top:8px;right:10px;font-size:20px;
                 border:none;background:none;cursor:pointer;line-height:1}
      .sbx-spin{position:absolute;inset:0;display:flex;align-items:center;
                justify-content:center;background:#0004;visibility:hidden}
      .sbx-spin div{width:42px;height:42px;border:6px solid #fff;border-top-color:#3498db;
                    border-radius:50%;animation:sbxspin 1s linear infinite}
      @keyframes sbxspin{to{transform:rotate(360deg)}}
    </style>

    <div class="sbx-back">
      <div class="sbx-wrap">
        <button id="sbx-close" class="sbx-close" aria-label="Close">&times;</button>
        <h2>Create Sandbox Courses</h2>

        <label>Course codes (one per line):</label>
        <textarea id="sbx-courses" placeholder="HHP 100&#10;HCE304&#10;HHP270"></textarea>

        <label>Instructor email:</label>
        <input id="sbx-email" type="email" placeholder="instructor@school.edu">

        <label>Instructor last name:</label>
        <input id="sbx-lname" type="text" placeholder="Smith">

        <button id="sbx-run" class="sbx-btn">Create</button>

        <div id="sbx-log" class="sbx-log"></div>

        <label style="margin-top:.6rem;display:block">Summary (clickable):</label>
        <div id="sbx-sum" class="sbx-sum"></div>
        <button id="sbx-copy" class="sbx-btn">Copy summary</button>

        <div id="sbx-spin" class="sbx-spin"><div></div></div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const $  = id => modal.querySelector(id);
  const log = m => { $('#sbx-log').textContent += m + '\n'; };

  $('#sbx-close').onclick = () => modal.remove();

  /* ---------- main flow ---------- */
  $('#sbx-run').onclick = async () => {
    const rawList  = $('#sbx-courses').value.trim();
    const email    = $('#sbx-email').value.trim();
    const lastName = $('#sbx-lname').value.trim().toUpperCase();

    if (!rawList || !email || !lastName) { alert('Please fill in every field.'); return; }

    $('#sbx-run').disabled = true;
    $('#sbx-spin').style.visibility = 'visible';

    const codes = rawList.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const accountId = getAccountId();
    log(`Using account ID ${accountId}`);

    /* look up instructor */
    let instructor;
    try {
      log(`Looking up user ${email} ...`);
      const users = await canvasFetch(`/accounts/${accountId}/users?search_term=${encodeURIComponent(email)}&per_page=100`);
      instructor  = users.find(u => [u.login_id, u.email].some(v => v?.toLowerCase() === email.toLowerCase()));
      if (!instructor) throw new Error('not found');
      log(`Instructor id ${instructor.id}`);
    } catch (err) {
      log(`Error: user ${email} ${err.message}`);
      $('#sbx-spin').style.visibility = 'hidden';
      return;
    }

    const htmlLines = [];
    const textLines = [];

    for (const raw of codes) {
      try {
        const base  = raw.replace(/\s+/g,'');
        const title = `${base} SANDBOX`;
        const code  = `${base}-SB-${lastName}`;

        /* duplicate guard */
        const dupSearch = await canvasFetch(`/accounts/${accountId}/courses?search_term=${encodeURIComponent(code)}&per_page=100`);
        const exists = dupSearch.find(c => [c.course_code, c.name].includes(code) || [c.course_code, c.name].includes(title));

        if (exists) {
          const openIt = confirm(`${title} already exists (course ${exists.id}).\nOK: open existing course\nCancel: skip creation`);
          if (openIt) window.open(`${origin}/courses/${exists.id}`, '_blank');
          log(`Skipped duplicate ${title}`);
          continue;
        }

        /* create course */
        log(`Creating ${title} ...`);
        const course = await canvasFetch(`/accounts/${accountId}/courses`, {
          method:'POST',
          body:JSON.stringify({ course:{ name:title, course_code:code, license:'private' } })
        });

        /* enroll teacher */
        await canvasFetch(`/courses/${course.id}/enrollments`, {
          method:'POST',
          body:JSON.stringify({ enrollment:{ user_id:instructor.id,
                                              type:'TeacherEnrollment',
                                              enrollment_state:'active',
                                              notify:true } })
        });

        const url = `${origin}/courses/${course.id}`;
        htmlLines.push(`${title}: <a href="${url}" target="_blank">${url}</a>`);
        textLines.push(`${title}: ${url}`);
        log(`✔ ${title} ready`);
        await new Promise(r => setTimeout(r, 300));  // throttle politely
      } catch (err) {
        log(`⚠️  ${raw}: ${err.message}`);
      }
    }

    /* show results */
    $('#sbx-sum').innerHTML = htmlLines.join('<br>');
    $('#sbx-spin').style.visibility = 'hidden';
    alert('All done! The summary list is ready.');

    /* copy handler */
    $('#sbx-copy').onclick = () => {
      if (!htmlLines.length) return;

      const htmlContent = htmlLines.join('<br>');
      const txtContent  = textLines.join('\r\n');     // preserve line breaks everywhere

      if (navigator.clipboard && window.ClipboardItem) {
        const item = new ClipboardItem({
          'text/html' : new Blob([htmlContent], {type:'text/html'}),
          'text/plain': new Blob([txtContent ], {type:'text/plain'})
        });
        navigator.clipboard.write([item])
          .then(() => alert('Summary copied – rich links kept for Outlook / Gmail'))
          .catch(() => alert('Clipboard write failed'));
      } else {
        navigator.clipboard.writeText(txtContent)
          .then(() => alert('Summary copied (plain text)'))
          .catch(() => alert('Clipboard write failed'));
      }
    };
  };

})();
