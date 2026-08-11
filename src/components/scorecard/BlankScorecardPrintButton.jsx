import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FilePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { canUseWindowPrint } from "@/lib/utils";
import { shareOrDownloadPdf } from "@/lib/fileShare";
import { toast } from "sonner";
import ScorecardHtmlPreview from "@/components/scorecard/ScorecardHtmlPreview";

/**
 * Print blank scorecards matching the round's game format.
 *  - Browser: window.print() renders the #print-blank-scorecards portal (the
 *    print-blank-mode body class isolates it from the live scorecard portal).
 *  - Native app WebView: window.print() is a no-op, so generate a blank
 *    scorecard PDF server-side and download it for the OS share/print sheet.
 */
export default function BlankScorecardPrintButton({ round, variant = "outline", size = "sm", className = "" }) {
  const [isGenerating, setIsGenerating] = useState(false);

  const groups = useMemo(() => {
    if (!round) return [];
    const isTeamMode =
      round.team_mode === true ||
      ["team_scramble", "team_best_ball", "team_6_6_6", "team_chapman", "team_aggregate"].includes(round.game_type);
    const blank = (id, count) =>
      Array.from({ length: count }, (_, i) => ({ name: "", player_id: `blank-${id}-${i}`, scores: [] }));
    if (isTeamMode) {
      const teamSize = round.team_size || 2;
      return [blank("A", teamSize), blank("B", teamSize)];
    }
    const groupSize = round.tee_sheet_config?.group_size || 4;
    return [blank("A", groupSize), blank("B", groupSize)];
  }, [round]);

  if (!round) return null;

  const handlePrint = async () => {
    if (canUseWindowPrint()) {
      document.body.classList.add("print-blank-mode");
      const cleanup = () => {
        document.body.classList.remove("print-blank-mode");
        window.removeEventListener("afterprint", cleanup);
      };
      window.addEventListener("afterprint", cleanup);
      window.print();
      setTimeout(cleanup, 2000);
      return;
    }
    setIsGenerating(true);
    try {
      const res = await base44.functions.invoke("generateBlankScorecardPdf", { roundId: round.id, _cb: Date.now() });
      const { url, filename } = res?.data || {};
      if (!url) throw new Error("No URL returned from server");
      await shareOrDownloadPdf(url, filename || `blank-scorecard-${round.event_name || "golf"}.pdf`);
      toast.success("Blank scorecard ready — use the share sheet to print or save.");
    } catch (error) {
      toast.error("Failed to generate blank scorecard PDF: " + (error.message || "unknown error"));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <Button variant={variant} size={size} onClick={handlePrint} disabled={isGenerating} className={`gap-2 ${className}`}>
        {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus className="w-4 h-4" />}
        {isGenerating ? "Generating..." : "Blank Scorecard"}
      </Button>
      {createPortal(
        <div id="print-blank-scorecards">
          <div className="print-scorecard-page">
            {groups.map((grp, i) => (
              <ScorecardHtmlPreview key={i} round={round} group={grp} />
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}