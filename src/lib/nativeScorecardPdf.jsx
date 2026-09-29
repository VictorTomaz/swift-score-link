import React from "react";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import ScorecardHtmlPreview from "@/components/scorecard/ScorecardHtmlPreview";
import { getScorecardGroups, getPrintPages } from "@/lib/scorecardGroups";

/**
 * Render the app's existing scorecard layout into a PDF for the native WebView.
 * Grouping, player fields, team formats, and blank score cells all come from
 * the same ScorecardHtmlPreview used by browser printing.
 */
export async function generateNativeScorecardPdf(round, players = round?.players || []) {
  if (!round) throw new Error("A round is required to generate scorecards");

  const roundWithPlayers = { ...round, players };
  const groups = getScorecardGroups(roundWithPlayers, players);
  if (!groups.length) throw new Error("No players assigned to scorecards");
  const pages = getPrintPages(groups, roundWithPlayers.team_mode);

  const mount = document.createElement("div");
  mount.id = "native-scorecard-pdf-render";
  mount.setAttribute("aria-hidden", "true");
  mount.style.cssText = "position:fixed;left:0;top:0;z-index:-1;width:10.5in;background:#fff;pointer-events:none";
  document.body.appendChild(mount);

  const root = createRoot(mount);
  try {
    root.render(
      <>
        <style>{`
          #native-scorecard-pdf-render { color: #000; }
          #native-scorecard-pdf-render .print-scorecard-page {
            box-sizing: border-box; display: flex; flex-direction: column;
            justify-content: space-between; width: 10.5in; height: 7.4in;
            min-height: 7.4in; padding: 0; background: #fff; overflow: hidden;
          }
          #native-scorecard-pdf-render .print-scorecard-page > div { break-inside: avoid; }
          #native-scorecard-pdf-render table {
            width: 10.3in !important; table-layout: fixed !important;
            border-collapse: collapse !important; font-size: 13px !important;
          }
          #native-scorecard-pdf-render table th,
          #native-scorecard-pdf-render table td {
            box-sizing: border-box; padding: 6px 3px !important;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          }
          #native-scorecard-pdf-render .print-write-row td {
            height: 38px !important; padding-top: 2px !important;
            padding-bottom: 2px !important; font-size: 12px !important;
          }
          #native-scorecard-pdf-render .team-name-cell {
            white-space: normal !important; overflow: visible !important;
            text-overflow: clip !important; word-break: break-word;
          }
        `}</style>
        {pages.map((pageGroups, pageIndex) => (
          <div className="print-scorecard-page" key={pageIndex}>
            {pageGroups.map((group, groupIndex) => (
              <ScorecardHtmlPreview
                key={`${pageIndex}-${groupIndex}`}
                round={roundWithPlayers}
                group={group}
              />
            ))}
          </div>
        ))}
      </>
    );

    // React and WKWebView need a layout pass before html2canvas reads the DOM.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const pageElements = [...mount.querySelectorAll(".print-scorecard-page")];
    if (!pageElements.length) throw new Error("Scorecard layout could not be rendered");

    const pdf = new jsPDF({ orientation: "landscape", unit: "in", format: "letter" });
    for (const [index, page] of pageElements.entries()) {
      const canvas = await html2canvas(page, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        windowWidth: Math.ceil(10.5 * 96),
      });
      if (!canvas.width || !canvas.height) throw new Error("Scorecard page rendered empty");
      if (index > 0) pdf.addPage("letter", "landscape");
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0.25, 0.25, 10.5, 7.4, undefined, "FAST");
      canvas.width = 0;
      canvas.height = 0;
    }
    return pdf.output("blob");
  } finally {
    root.unmount();
    mount.remove();
  }
}
