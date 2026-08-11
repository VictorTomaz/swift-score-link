import { useState } from "react";
import { createPortal } from "react-dom";
import { Printer, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { canUseWindowPrint } from "@/lib/utils";
import { shareOrDownloadPdf } from "@/lib/fileShare";
import { toast } from "sonner";
import ScorecardHtmlPreview from "@/components/scorecard/ScorecardHtmlPreview";
import { getScorecardGroups, getPrintPages } from "@/lib/scorecardGroups";

/**
 * Print the round's scorecards.
 *  - Browser: window.print() renders the #print-scorecards portal (live HTML).
 *  - Native app WebView: window.print() is a no-op, so generate a scorecard
 *    PDF server-side and download it so the OS share/print sheet can handle it.
 */
export default function ScorecardPrintButton({ round, variant = "outline", size = "sm", className = "" }) {
  const [isGenerating, setIsGenerating] = useState(false);
  if (!round) return null;
  const groups = getScorecardGroups(round);
  const printPages = getPrintPages(groups, round.team_mode);

  const handlePrint = async () => {
    if (!groups.length) return;
    if (canUseWindowPrint()) {
      window.print();
      return;
    }
    setIsGenerating(true);
    try {
      const res = await base44.functions.invoke("generateScorecardPdf", { roundId: round.id, _cb: Date.now() });
      const { url, filename } = res?.data || {};
      if (!url) throw new Error("No URL returned from server");
      await shareOrDownloadPdf(url, filename || `scorecards-${round.event_name || "golf"}.pdf`);
      toast.success("Scorecards ready — use the share sheet to print or save.");
    } catch (error) {
      toast.error("Failed to generate scorecard PDF: " + (error.message || "unknown error"));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <Button variant={variant} size={size} onClick={handlePrint} disabled={!groups.length || isGenerating} className={`gap-2 ${className}`}>
        {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
        {isGenerating ? "Generating..." : "Print Scorecards"}
      </Button>
      {createPortal(
        <div id="print-scorecards">
          {printPages.map((pageGroups, pi) => (
            <div key={pi} className="print-scorecard-page">
              {pageGroups.map((grp, gi) => (
                <ScorecardHtmlPreview key={gi} round={round} group={grp} />
              ))}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}