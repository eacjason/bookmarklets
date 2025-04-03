javascript:(function(){
  'use strict';
  
  // Function to export a table to CSV, excluding specified columns.
  function exportTableToCSV(tableSelector, filename) {
    var table = document.querySelector(tableSelector);
    if (!table) {
      alert("Table not found!");
      return;
    }
    var rows = Array.from(table.querySelectorAll("tr")).map(function(tr) {
      var cells = Array.from(tr.querySelectorAll("th, td"));
      // Exclude columns: 3 ("Class Status"), 4 ("Class Date"), and 8 ("Image")
      var filteredCells = cells.filter(function(cell, i) {
        return i !== 3 && i !== 4 && i !== 8;
      }).map(function(cell) {
        // Trim text and collapse multiple whitespace characters
        var text = cell.textContent.trim().replace(/\s+/g, " ");
        return '"' + text.replace(/"/g, '""') + '"';
      });
      return filteredCells.join(",");
    });
    var csvContent = rows.join("\n");
    var blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    var link = document.createElement("a");
    if (link.download !== undefined) { // feature detection
      var url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }
  
  // Loop through each cell that holds the roster link area.
  var cells = document.querySelectorAll("[id$='_DivEmailClass']");
  cells.forEach(function(cell) {
    // Find the outer container (div with text-align: left)
    var container = cell.closest("div[style*='text-align: left']");
    if (!container) return;
    
    // Prevent duplicate link additions
    if (container.querySelector(".view-roster-link")) return;
    
    // Get the envelope icon and extract the CSI from its onclick attribute.
    var emailIcon = cell.querySelector("i[onclick^='showEmailClass']");
    if (emailIcon) {
      var onclickText = emailIcon.getAttribute("onclick");
      var match = onclickText.match(/showEmailClass\((\d+),/);
      if(match) {
        var csiId = match[1];
        
        // Extract course code and section number from the corresponding row.
        var row = cell.closest("tr");
        var courseCode = "";
        var sectionNumber = "";
        if (row) {
          var courseSpan = row.querySelector("span[id*='_lblCourse']");
          if (courseSpan) {
            courseCode = courseSpan.textContent.trim();
          }
          // Assume the section number appears as a sequence of digits in the container text.
          var containerText = container.textContent;
          var secMatch = containerText.match(/(\d{3,})/);
          if (secMatch) {
            sectionNumber = secMatch[1];
          }
        }
        
        // Create "View Roster" link.
        var viewLink = document.createElement("a");
        viewLink.textContent = "View Roster";
        viewLink.href = "#";
        viewLink.className = "view-roster-link";
        viewLink.style.fontSize = "smaller";
        viewLink.style.display = "inline-block";
        viewLink.style.marginTop = "5px";
        viewLink.style.textDecoration = "underline";
        viewLink.addEventListener("click", function(e){
          e.preventDefault();
          var domain = document.location.protocol + "//" + document.location.host;
          var url = domain + "/CMCPortal/Secure/Staff/Acad/ClassRoster_DayView.aspx?v=d&csi=" + csiId;
          window.open(url, "RosterWindow", "width=1450,height=800");
        });
        
        // Create "Export CSV" link.
        var exportLink = document.createElement("a");
        exportLink.textContent = "Export CSV";
        exportLink.href = "#";
        exportLink.className = "export-csv-link";
        exportLink.style.fontSize = "smaller";
        exportLink.style.display = "inline-block";
        exportLink.style.marginTop = "5px";
        exportLink.style.marginLeft = "10px";
        exportLink.style.textDecoration = "underline";
        exportLink.addEventListener("click", function(e){
          e.preventDefault();
          var domain = document.location.protocol + "//" + document.location.host;
          var url = domain + "/CMCPortal/Secure/Staff/Acad/ClassRoster_DayView.aspx?v=d&csi=" + csiId;
          var rosterWindow = window.open(url, "RosterWindowExport", "width=1450,height=800");
          // Poll for the roster table in the new window.
          var pollInterval = setInterval(function(){
            if (rosterWindow && rosterWindow.document && rosterWindow.document.readyState === "complete") {
              var rosterTable = rosterWindow.document.querySelector("#dgClassRoster");
              if (rosterTable) {
                clearInterval(pollInterval);
                var filename = (courseCode && sectionNumber) ? courseCode + "-" + sectionNumber + ".csv" : "export.csv";
                rosterWindow.eval('(' + exportTableToCSV.toString() + ')(\"#dgClassRoster\", \"' + filename + '\");');
                // The pop-up stays open for you to review the file dialog.
              }
            }
          }, 500);
        });
        
        // Append a line break, then add both links to the container.
        container.appendChild(document.createElement("br"));
        container.appendChild(viewLink);
        container.appendChild(exportLink);
      }
    }
  });
})();
