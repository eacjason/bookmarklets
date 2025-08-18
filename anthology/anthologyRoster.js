javascript:(function(){
  'use strict';

  // Helper: create elements
  function el(tag, props, ...children){
    const e = document.createElement(tag);
    if (props) Object.assign(e, props);
    for (const c of children){
      if (c == null) continue;
      if (typeof c === 'string') e.appendChild(document.createTextNode(c));
      else e.appendChild(c);
    }
    return e;
  }

  // Fetch roster page HTML and return a DOM
  async function fetchRosterDoc(csiId){
    const domain = document.location.protocol + '//' + document.location.host;
    const url = domain + '/CMCPortal/Secure/Staff/Acad/ClassRoster_DayView.aspx?v=d&csi=' + encodeURIComponent(csiId);
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('Fetch failed: ' + res.status);
    const html = await res.text();
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  }

  // Count students = number of body rows in the roster table
  function countStudents(doc){
    const rows = doc.querySelectorAll('#dgClassRoster tbody tr');
    return { total: rows.length };
  }

  // Export table to CSV in a popup context (same as your original)
  function exportTableToCSV(tableSelector, filename) {
    var table = document.querySelector(tableSelector);
    if (!table) {
      alert('Table not found!');
      return;
    }
    var rows = Array.from(table.querySelectorAll('tr')).map(function(tr) {
      var cells = Array.from(tr.querySelectorAll('th, td'));
      // Exclude columns 3, 4, 8
      var filteredCells = cells.filter(function(cell, i) {
        return i !== 3 && i !== 4 && i !== 8;
      }).map(function(cell) {
        var text = cell.textContent.trim().replace(/\s+/g, ' ');
        return '"' + text.replace(/"/g, '""') + '"';
      });
      return filteredCells.join(',');
    });
    var csvContent = rows.join('\n');
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    if (link.download !== undefined) {
      var url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  // Main loop: add links and count badge
  const cells = document.querySelectorAll("[id$='_DivEmailClass']");
  cells.forEach(function(cell){
    const container = cell.closest("div[style*='text-align: left']");
    if (!container) return;

    if (container.querySelector('.view-roster-link')) return; // already processed

    const emailIcon = cell.querySelector("i[onclick^='showEmailClass']");
    if (!emailIcon) return;

    const onclickText = emailIcon.getAttribute('onclick');
    const match = onclickText && onclickText.match(/showEmailClass\((\d+),/);
    if (!match) return;

    const csiId = match[1];

    // Extract course code and section
    const row = cell.closest('tr');
    let courseCode = '', sectionNumber = '';
    if (row){
      const courseSpan = row.querySelector("span[id*='_lblCourse']");
      if (courseSpan) courseCode = courseSpan.textContent.trim();
      const text = container.textContent;
      const secMatch = text && text.match(/(\d{3,})/);
      if (secMatch) sectionNumber = secMatch[1];
    }

    const domain = document.location.protocol + '//' + document.location.host;
    const rosterUrl = domain + '/CMCPortal/Secure/Staff/Acad/ClassRoster_DayView.aspx?v=d&csi=' + csiId;

    // View Roster link
    const viewLink = el('a', {
      href: '#',
      className: 'view-roster-link',
      onclick: function(e){
        e.preventDefault();
        window.open(rosterUrl, 'RosterWindow', 'width=1450,height=800');
      }
    }, 'View Roster');

    // Export CSV link
    const exportLink = el('a', {
      href: '#',
      className: 'export-csv-link',
      onclick: function(e){
        e.preventDefault();
        const w = window.open(rosterUrl, 'RosterWindowExport', 'width=1450,height=800');
        const poll = setInterval(function(){
          try{
            if (w && w.document && w.document.readyState === 'complete'){
              const t = w.document.querySelector('#dgClassRoster');
              if (t){
                clearInterval(poll);
                const filename = (courseCode && sectionNumber) ? (courseCode + '-' + sectionNumber + '.csv') : 'export.csv';
                w.eval('(' + exportTableToCSV.toString() + ')(\"#dgClassRoster\", \"' + filename + '\");');
              }
            }
          }catch(err){ /* wait */ }
        }, 500);
      }
    }, 'Export CSV');

    // Count badge
    const badge = el('span', { className: 'roster-count-badge', title: 'Click to refresh' }, 'Count: …');
    Object.assign(badge.style, {
      display: 'inline-block',
      marginLeft: '10px',
      fontSize: '12px',
      padding: '2px 6px',
      borderRadius: '999px',
      border: '1px solid #ccc',
      cursor: 'pointer',
      userSelect: 'none'
    });

    async function refreshCount(){
      badge.textContent = 'Counting…';
      try{
        const doc = await fetchRosterDoc(csiId);
        const stats = countStudents(doc);
        badge.textContent = `Count: ${stats.total}`;
      }catch(err){
        badge.textContent = 'Count: error';
        badge.title = String(err);
      }
    }
    badge.addEventListener('click', refreshCount);

    // Layout
    container.appendChild(document.createElement('br'));
    [viewLink, exportLink].forEach(a => {
      a.style.fontSize = 'smaller';
      a.style.display = 'inline-block';
      a.style.marginTop = '5px';
      a.style.textDecoration = 'underline';
    });
    exportLink.style.marginLeft = '10px';

    container.appendChild(viewLink);
    container.appendChild(exportLink);
    container.appendChild(badge);

    // Auto count once
    refreshCount();
  });

})();
