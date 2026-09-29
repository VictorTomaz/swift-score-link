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
import { Capacitor } from "@capacitor/core";
import { generateNativeScorecardPdf } from "@/lib/nativeScorecardPdf.jsx";

/**
 * Print the round's scorecards.
 *  - Browser: window.print() renders the #print-scorecards portal (live HTML).
 *  - Native iOS app: window.print() is a no-op, so render the same scorecards
 *    to a local PDF and hand it to the OS share/print sheet.
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
      const filename = `scorecards-${round.event_name || "golf"}.pdf`;
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios") {
        const blob = await generateNativeScorecardPdf(round);
        const url = URL.createObjectURL(blob);
        try {
          await shareOrDownloadPdf(url, filename);
        } finally {
          URL.revokeObjectURL(url);
        }
      } else {
        const res = await base44.functions.invoke("generateScorecardPdf", { roundId: round.id, _cb: Date.now() });
        const { url, filename: serverFilename } = res?.data || {};
        if (!url) throw new Error("No URL returned from server");
        await shareOrDownloadPdf(url, serverFilename || filename);
      }
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
