javascript:(function(){
  'use strict';
  const cells = document.querySelectorAll("[id$='_DivEmailClass']");
  cells.forEach(cell => {
    const container = cell.closest("div[style*='text-align: left']");
    if (!container) return;
    if (container.querySelector(".view-roster-link")) return;
    
    const emailIcon = cell.querySelector("i[onclick^='showEmailClass']");
    if (emailIcon) {
      const onclickText = emailIcon.getAttribute("onclick");
      const match = onclickText.match(/showEmailClass\((\d+),/);
      if(match) {
        const csiId = match[1];
        const link = document.createElement("a");
        link.textContent = "View Roster";
        link.href = "#";
        link.className = "view-roster-link";
        link.style.fontSize = "smaller";
        link.style.display = "inline-block";
        link.style.marginTop = "5px";
        link.style.textDecoration = "underline";
        
        link.addEventListener("click", function(e){
          e.preventDefault();
          const domain = document.location.protocol + "//" + document.location.host;
          const url = domain + "/CMCPortal/Secure/Staff/Acad/ClassRoster_DayView.aspx?v=d&csi=" + csiId;
          window.open(url, "RosterWindow", "width=1450,height=800");
        });
        
        container.appendChild(document.createElement("br"));
        container.appendChild(link);
      }
    }
  });
})();
