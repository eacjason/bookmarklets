(function() {
  /******************************************************
   * 1) Load PapaParse from CDN so we can parse CSV
   ******************************************************/
  var papaScript = document.createElement('script');
  papaScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js';
  papaScript.onload = initBookmarklet;
  document.head.appendChild(papaScript);

  function initBookmarklet() {
    /******************************************************
     * 2) Create a popup that has an "Import Grades" button
     ******************************************************/
    var popup = createPopup();
    var heading = document.createElement('h3');
    heading.textContent = 'Canvas → Anthology Import';
    popup.content.appendChild(heading);

    var desc = document.createElement('p');
    desc.textContent = 'Select your CSV file with "Student" and "Final Score" columns.';
    popup.content.appendChild(desc);

    var importBtn = document.createElement('button');
    importBtn.textContent = 'Import CSV';
    importBtn.style.marginRight = '10px';
    popup.content.appendChild(importBtn);

    var closeBtn = document.createElement('button');
    closeBtn.textContent = 'Cancel';
    closeBtn.onclick = function() {
      removePopup(popup.container);
    };
    popup.content.appendChild(closeBtn);

    // Hidden file input
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    importBtn.onclick = function() {
      fileInput.click();
    };

    fileInput.onchange = function() {
      var file = fileInput.files[0];
      if (!file) return;
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
          removePopup(popup.container); // remove the initial popup
          previewChanges(results.data); // go to preview step
          document.body.removeChild(fileInput); // clean up
        }
      });
    };
  }

  /******************************************************
   * 3) Parse & Preview Changes Before Applying
   ******************************************************/
  function previewChanges(csvRows) {
    var anthologyTable = document.getElementById('_ctl0_PlaceHolderMain_MyFinalGrades_finalGrades');
    if (!anthologyTable) {
      alert('Anthology grade table not found. Aborting.');
      return;
    }

    // Ensure required CSV columns exist
    var requiredCols = ['Student', 'Final Score'];
    var firstRow = csvRows[0] || {};
    var missing = requiredCols.filter(col => !(col in firstRow));
    if (missing.length > 0) {
      alert('Missing column(s) in CSV: ' + missing.join(', ') + '. Aborting.');
      return;
    }

    // Build a map: normalizedName -> { finalScore, finalGrade }
    var csvMap = {};
    csvRows.forEach(row => {
      var rawName  = (row['Student'] || '').trim();
      var rawScore = (row['Final Score'] || '').trim();
      var rawGrade = (row['Final Grade'] || '').trim(); // optional

      var normName = standardizeName(rawName);
      if (!normName ||
          normName === 'POINTS POSSIBLE' ||
          normName === 'STUDENT, TEST') {
        return;
      }
      // Parse score as number (skip if invalid)
      var parsedScore = parseFloat(rawScore);
      if (isNaN(parsedScore)) return;

      csvMap[normName] = {
        finalScore: parsedScore,
        rawScore: rawScore,
        finalGrade: rawGrade
      };
    });

    // Gather info from Anthology table
    var anthologyRows = Array.from(anthologyTable.querySelectorAll('tbody tr'));
    var unmatchedInTable = []; // anthology names not in CSV
    var matches = [];          // {anthName, csvScore, csvGrade, rowElement}
    anthologyRows.forEach(tr => {
      var nameSpan = tr.querySelector('span.control-label');
      if (nameSpan) {
        var anthName = standardizeName(nameSpan.textContent);
        var csvEntry = csvMap[anthName];
        if (csvEntry) {
          matches.push({
            anthName: anthName,
            csvScore: csvEntry.finalScore,
            csvGrade: csvEntry.finalGrade,
            rowElement: tr
          });
        } else {
          unmatchedInTable.push(anthName);
        }
      }
    });

    // Find CSV names that never matched an Anthology row
    var matchedNames = matches.map(m => m.anthName);
    var allCSVNames = Object.keys(csvMap);
    var unmatchedCSV = allCSVNames.filter(n => !matchedNames.includes(n));

    // Build a preview table
    var previewPopup = createPopup();
    var previewTitle = document.createElement('h3');
    previewTitle.textContent = 'Preview: Canvas → Anthology Updates';
    previewPopup.content.appendChild(previewTitle);

    // Show matched updates
    if (matches.length > 0) {
      var matchTable = document.createElement('table');
      matchTable.style.width = '100%';
      matchTable.style.borderCollapse = 'collapse';
      var mtHead = document.createElement('thead');
      mtHead.innerHTML = `
        <tr style="border-bottom:1px solid #ccc;">
          <th style="text-align:left;">Anthology Name</th>
          <th style="text-align:left;">Final Score</th>
          <th style="text-align:left;">Final Grade (if any)</th>
        </tr>`;
      matchTable.appendChild(mtHead);

      var mtBody = document.createElement('tbody');
      matches.forEach(m => {
        var row = document.createElement('tr');
        row.innerHTML = `
          <td style="padding:4px;">${m.anthName}</td>
          <td style="padding:4px;">${m.csvScore}</td>
          <td style="padding:4px;">${m.csvGrade || ''}</td>`;
        mtBody.appendChild(row);
      });
      matchTable.appendChild(mtBody);
      previewPopup.content.appendChild(document.createElement('hr'));
      var matchLabel = document.createElement('h4');
      matchLabel.textContent = 'Will Update These Rows:';
      previewPopup.content.appendChild(matchLabel);
      previewPopup.content.appendChild(matchTable);
    }

    // Show unmatched Anthology names
    if (unmatchedInTable.length > 0) {
      var uaDiv = document.createElement('div');
      uaDiv.style.marginTop = '10px';
      uaDiv.innerHTML = `<strong>Not Found in CSV (Anthology list):</strong><br>`
                      + unmatchedInTable.join('<br>');
      previewPopup.content.appendChild(document.createElement('hr'));
      previewPopup.content.appendChild(uaDiv);
    }

    // Show unmatched CSV names
    if (unmatchedCSV.length > 0) {
      var ucDiv = document.createElement('div');
      ucDiv.style.marginTop = '10px';
      ucDiv.innerHTML = `<strong>Not Found in Anthology (CSV file):</strong><br>`
                      + unmatchedCSV.join('<br>');
      previewPopup.content.appendChild(document.createElement('hr'));
      previewPopup.content.appendChild(ucDiv);
    }

    // Confirm / Cancel buttons
    var buttonBar = document.createElement('div');
    buttonBar.style.marginTop = '20px';

    var confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Confirm Updates';
    confirmBtn.style.marginRight = '10px';
    confirmBtn.onclick = function() {
      applyChanges(matches);
      removePopup(previewPopup.container);
    };
    buttonBar.appendChild(confirmBtn);

    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = function() {
      removePopup(previewPopup.container);
    };
    buttonBar.appendChild(cancelBtn);

    previewPopup.content.appendChild(buttonBar);
  }

  /******************************************************
   * 4) Apply changes after user confirms
   ******************************************************/
  function applyChanges(matches) {
    console.info('Applying updates to Anthology...');
    matches.forEach(m => {
      var tr = m.rowElement;
      var scoreInput = tr.querySelector('input[type="text"][name*="txtNumericGrade"]');
      var gradeSelect = tr.querySelector('select[name*="lstFinalGrade"]');

      if (scoreInput) {
        scoreInput.value = m.csvScore;
        // Fire the same events Anthology does on user input
        scoreInput.dispatchEvent(new Event('change', { bubbles: true }));
        scoreInput.dispatchEvent(new Event('blur', { bubbles: true }));
      }
      if (gradeSelect && m.csvGrade) {
        setTimeout(function() {
          gradeSelect.value = m.csvGrade;
        }, 200);
      }
      // Highlight updated row
      tr.style.backgroundColor = '#ffff99';
      setTimeout(function() {
        tr.style.backgroundColor = '';
      }, 2000);
      console.info(`Updated: ${m.anthName} => Score: ${m.csvScore}, Grade: ${m.csvGrade || '(auto)'}`);
    });
    console.info('Done. Remember to SAVE your changes in Anthology.');
  }

  /******************************************************
   * 5) Utility: create a popup
   ******************************************************/
  function createPopup() {
    var container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '20%';
    container.style.left = '50%';
    container.style.transform = 'translateX(-50%)';
    container.style.background = '#fff';
    container.style.border = '1px solid #ccc';
    container.style.padding = '20px';
    container.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';
    container.style.zIndex = '10000';
    container.style.width = '400px';
    container.style.maxHeight = '70vh';
    container.style.overflowY = 'auto';
    container.style.fontFamily = 'Arial, sans-serif';

    var content = document.createElement('div');
    container.appendChild(content);
    document.body.appendChild(container);

    return { container: container, content: content };
  }

  function removePopup(container) {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }

  /******************************************************
   * 6) Utility: standardizeName
   *    - Uppercase
   *    - If no comma, assume "First Last" => "LAST, FIRST"
   ******************************************************/
  function standardizeName(name) {
    name = name.trim();
    if (name.indexOf(',') >= 0) {
      return name.toUpperCase().replace(/\s+/g, ' ').trim();
    } else {
      var parts = name.split(/\s+/);
      if (parts.length === 2) {
        return (parts[1] + ', ' + parts[0]).toUpperCase();
      } else {
        return name.toUpperCase().replace(/\s+/g, ' ').trim();
      }
    }
  }
})();
