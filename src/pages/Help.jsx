import React, { useState, useRef } from "react";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { FileDown, ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PageDescription from "@/components/PageDescription";

// Swift Score 11 payout chart (player count → [place amounts at $11 buy-in])
const SS11_CHART = [
  { players: 6,  gross: ["$8", "$4", "$3"] },
  { players: 7,  gross: ["$9", "$6", "$3"] },
  { players: 8,  gross: ["$10", "$6", "$4"] },
  { players: 9,  gross: ["$11", "$8", "$4"] },
  { players: 10, gross: ["$12", "$8", "$5"] },
  { players: 11, gross: ["$13", "$10", "$5"] },
  { players: 12, gross: ["$14", "$10", "$6"] },
  { players: 13, gross: ["$15", "$9", "$5", "$3"] },
  { players: 14, gross: ["$16", "$10", "$5", "$4"] },
  { players: 15, gross: ["$17", "$10", "$6", "$4"] },
  { players: 16, gross: ["$18", "$11", "$6", "$5"] },
  { players: 17, gross: ["$19", "$11", "$7", "$5"] },
  { players: 18, gross: ["$20", "$12", "$7", "$6"] },
  { players: 19, gross: ["$22", "$12", "$8", "$6"] },
  { players: 20, gross: ["$22", "$13", "$8", "$7"] },
  { players: 21, gross: ["$23", "$13", "$9", "$7"] },
  { players: 22, gross: ["$24", "$14", "$10", "$7"] },
  { players: 23, gross: ["$25", "$14", "$10", "$7"] },
  { players: 24, gross: ["$26", "$16", "$10", "$8"] },
  { players: 25, gross: ["$26", "$15", "$10", "$6", "$5"] },
  { players: 26, gross: ["$28", "$15", "$10", "$7", "$5"] },
  { players: 27, gross: ["$28", "$16", "$11", "$7", "$5"] },
  { players: 28, gross: ["$29", "$16", "$11", "$7", "$6"] },
  { players: 29, gross: ["$29", "$17", "$12", "$8", "$6"] },
  { players: 30, gross: ["$30", "$17", "$12", "$9", "$7"] },
  { players: 31, gross: ["$30", "$18", "$13", "$9", "$7"] },
  { players: 32, gross: ["$31", "$18", "$13", "$10", "$8"] },
  { players: 33, gross: ["$31", "$19", "$14", "$10", "$8"] },
  { players: 34, gross: ["$32", "$19", "$14", "$11", "$9"] },
  { players: 35, gross: ["$32", "$20", "$15", "$11", "$9"] },
  { players: 36, gross: ["$33", "$20", "$15", "$12", "$10"] },
  { players: 37, gross: ["$33", "$21", "$16", "$12", "$10"] },
  { players: 38, gross: ["$34", "$21", "$16", "$13", "$11"] },
  { players: 39, gross: ["$34", "$22", "$17", "$13", "$11"] },
  { players: 40, gross: ["$35", "$22", "$17", "$14", "$12"] },
  { players: 41, gross: ["$35", "$23", "$18", "$14", "$12"] },
  { players: 42, gross: ["$35", "$23", "$18", "$15", "$13"] },
  { players: 43, gross: ["$36", "$24", "$19", "$15", "$13"] },
  { players: 44, gross: ["$37", "$24", "$19", "$16", "$14"] },
  { players: 45, gross: ["$37", "$25", "$20", "$16", "$14"] },
  { players: 46, gross: ["$38", "$25", "$21", "$17", "$15"] },
  { players: 47, gross: ["$38", "$26", "$21", "$17", "$15"] },
  { players: 48, gross: ["$39", "$26", "$22", "$17", "$16"] },
  { players: 49, gross: ["$39", "$27", "$22", "$18", "$16"] },
  { players: 50, gross: ["$40", "$27", "$22", "$18", "$17", "$12"] },
  { players: 51, gross: ["$41", "$28", "$23", "$18", "$17", "$13"] },
  { players: 52, gross: ["$41", "$28", "$23", "$19", "$18", "$13"] },
  { players: 53, gross: ["$42", "$29", "$24", "$19", "$18", "$14"] },
  { players: 54, gross: ["$42", "$29", "$24", "$20", "$19", "$14"] },
  { players: 55, gross: ["$43", "$30", "$25", "$20", "$19", "$14"] },
  { players: 56, gross: ["$43", "$30", "$25", "$21", "$20", "$15"] },
  { players: 57, gross: ["$43", "$31", "$26", "$21", "$20", "$15"] },
  { players: 58, gross: ["$44", "$31", "$26", "$22", "$21", "$15"] },
  { players: 59, gross: ["$44", "$32", "$27", "$22", "$21", "$16"] },
  { players: 60, gross: ["$45", "$32", "$27", "$23", "$22", "$16"] },
  { players: 61, gross: ["$45", "$33", "$28", "$23", "$22", "$16"] },
  { players: 62, gross: ["$46", "$33", "$28", "$24", "$23", "$17"] },
  { players: 63, gross: ["$46", "$34", "$29", "$24", "$23", "$17"] },
  { players: 64, gross: ["$47", "$34", "$29", "$25", "$24", "$18"] },
  { players: 65, gross: ["$47", "$35", "$30", "$25", "$24", "$18", "$12"] },
  { players: 66, gross: ["$48", "$35", "$30", "$26", "$25", "$18", "$13"] },
  { players: 67, gross: ["$48", "$36", "$31", "$26", "$25", "$19", "$13"] },
  { players: 68, gross: ["$49", "$36", "$31", "$27", "$26", "$19", "$14"] },
  { players: 69, gross: ["$49", "$37", "$32", "$27", "$26", "$19", "$14"] },
  { players: 70, gross: ["$50", "$37", "$32", "$28", "$27", "$20", "$15"] },
];

const PLACE_LABELS = ["1st", "2nd", "3rd", "4th", "5th"];

const steps = [
  {
    title: "1. Dashboard",
    content: "The Dashboard is your home screen. It shows key stats (rounds played, active rounds, total players, total pot) and quick links to active rounds and recent results. Tap 'New Round' to get started, or use Settings → Tournament Logistics to set up tee times and print scorecards before the round.",
  },
  {
    title: "1B. Tournament Logistics (Scorecards, Tee Times & Tee Sheets)",
    content: "Tournament Logistics (in the Settings menu) is your one-stop spot for getting a round ready to play.\n\n⚠️ Prerequisite: You must have a round created and players added to the roster first. Tee times and scorecards pull player names, handicaps, and groupings directly from your roster — without names on the roster, generated tee times and scorecards will come out blank.\n\nThe typical workflow is: Create a Round (step 2) → Add Players to the Roster (step 3) → then come here to Tournament Logistics to set up tee times and print scorecards.\n\n• Tee Times — set a start time, interval, and group size, then tap 'Generate' to auto-assign times using one of several shuffling algorithms, or tap a player then a time slot to place them manually. Tag players with a group label (A, B, C…) for scorecard grouping. Tap 'Save' to keep assignments, 'Print' for a tee sheet PDF, or 'To Me' to email them to your players.\n\n• Scorecards — tap 'Generate Scorecards' to produce a printable PDF, stacked two per page with a dashed cut line and grouped by tee time. Player names, course handicaps, par, and handicap indexes are pre-filled; score cells are blank. Need a generic one with only the course info? Tap 'Blank Scorecard'.\n\n• Always the latest copy — each generation saves its PDF link to the round, and the app always opens the most recent version, so you never accidentally pull up a stale or cached scorecard.",
  },
  {
    title: "2. Starting a New Round",
    content: "Go to New Round / Setup and walk through the step-by-step wizard:\n\n1. Choose a Game Mode (Fixed, Custom, or Off).\n2. Select a Course (optional — you can skip if no course is saved).\n3. Enter the Competition / Event Name.\n4. Pick the Date.\n5. Set the Buy-In amount per player.\n6. Enter the Number of Players.\n7. Configure Side Games (KPs, Gross Skins, Net Skins, Deuce Pot — each can have a separate buy-in pool).\n\nTap 'Start Round' when ready.",
  },
  {
    title: "3. Player Roster",
    content: "After creating the round you land on the Roster screen. Add players by:\n\n• Typing a name and handicap manually and tapping 'Add Player'.\n• Selecting from the Master Roster (players saved in Player Management).\n• Using the Microphone to dictate a list of player names and handicaps via voice.\n\nTo edit a player's handicap for this round, tap the pencil icon next to their name, update the value, then tap the checkmark.\n\nTo remove a player, tap the trash icon.\n\nOnce all players are added, tap 'Lock Roster & Start Scoring' to move to the Scorecard.",
  },
  {
    title: "4. Course Setup",
    content: "On the Scorecard you can set up the course by entering Par and Handicap Index for each of the 18 holes. You can load a saved course from Course Management or save the current setup as a new course for future rounds.",
  },
  {
    title: "5. Entering Scores",
    content: "Pick your entry mode at the top — Tap, Type, Dictate, or Scan. Select a player (or a group), then tap 'Start Scorecard'. In Tap mode, tap a hole to enter a score directly — no arrow navigation needed. Scores are color-coded:\n\n• Eagle or better – Gold\n• Birdie – Green\n• Par – White/Default\n• Bogey – Yellow\n• Double bogey or worse – Red\n\nYou can also dictate scores via voice using the Dictate mode. Scores save automatically as you go (a '✓ All scores saved' indicator confirms it). When all 18 holes are entered for a player, a verify summary card appears — tap 'Verify & Continue' to move to the next player. Once everyone is scored, tap 'Compute Results'.",
  },
  {
    title: "5B. Scan Scorecard (Optional)",
    content: "If you used printed scorecards during the round, you can scan them to automatically enter scores:\n\n1. On the Scorecard page, tap the 'Scan Scorecard' button (camera icon).\n2. Take a photo of the filled-out scorecard — ensure all four corners are visible and the card is flat.\n3. The app extracts player names and scores using OCR technology.\n4. Review the extracted data in the preview modal — you can edit any scores before saving.\n5. Tap 'Save' to import all scores into the round.\n\nThe corner dots on printed scorecards help the scanner align accurately. For best results, use good lighting and keep the card flat.",
  },
  {
    title: "6. Side Games",
    content: "If you enabled side games, assign participants to each pool (KP, Gross Skins, Net Skins, Deuce Pot). For KP rounds, select the winning player for each designated hole. All side game results feed into the final payout calculation.\n\nDeuce Pot: Any player who scores a 2 or better on any hole wins a share of the pot — this includes any hole, not just par 3s. A hole-in-one counts as a deuce. If multiple players make a deuce in the same round, the pot is split equally among all of them.",
  },
  {
    title: "7. Computing Results",
    content: "Once all scores are entered, tap 'Compute Results' on the Scorecard. The engine validates all data and calculates:\n\n• Gross and Net standings with payouts.\n• KP winners.\n• Skins results (with optional carryover).\n• Deuce pot winners.\n• Final payout per player.\n\nIndividual winning amounts are shown as raw (unrounded) values throughout the round. At the final tally, all payouts are rounded up or down to the nearest dollar so the total never exceeds the pot.\n\nYou will be taken to the Results page automatically.",
  },
  {
    title: "8. Results Page",
    content: "The Results page shows a full breakdown of the round:\n\n• Total pot and side pot amounts.\n• Gross and Net standings.\n• KP winners.\n• Skins results.\n• Deuce pot results.\n• Final Payouts table for every player.\n\nYou can reopen the round to edit scores or recompute results if needed.",
  },
  {
    title: "9. History",
    content: "The History page lists all past rounds with dates, player counts, and buy-in info. Tap any round to view its full results again.",
  },
  {
    title: "10. Player Management",
    content: "Manage your Master Roster here. Add players with their name and handicap. These players can be quickly added to any future round from the Roster screen. Update handicaps here to keep your roster current.",
  },
  {
    title: "11. Course Management",
    content: "Save and manage golf courses with their par and handicap index for all 18 holes. Load a saved course during round setup to avoid re-entering hole data each time.",
  },
];

function GameModeGuide() {
  const [openMode, setOpenMode] = useState("swift");

  const modes = [
    { key: "swift", label: "⚡ Swift Score 11", color: "bg-primary/10 border-primary/30 text-primary" },
    { key: "custom", label: "🎛️ Custom", color: "bg-accent/10 border-accent/30 text-accent-foreground" },
    { key: "off", label: "📋 Off (Scoring Only)", color: "bg-muted border-border text-muted-foreground" },
  ];

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="p-5 pb-3">
        <h2 className="text-base font-bold text-primary mb-1">🏌️ Game Mode Guide</h2>
        <p className="text-sm text-muted-foreground">Tap each mode to learn how it works.</p>
      </div>

      <div className="divide-y divide-border">
        {/* SWIFT SCORE 11 */}
        <div>
          <button
            className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-muted/30 transition-colors"
            onClick={() => setOpenMode(openMode === "swift" ? null : "swift")}
          >
            <span className="font-semibold text-sm text-foreground">⚡ Fixed Payouts</span>
            {openMode === "swift" ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {openMode === "swift" && (
            <div className="px-5 pb-5 space-y-4">
              <p className="text-sm text-foreground leading-relaxed">
                Fixed Payouts is a <strong>ready-to-go payout format</strong> — no setup required. Based on a <strong>$11 buy-in per player</strong>, the app automatically calculates how much each place wins for both <strong>Gross</strong> (actual scores) and <strong>Net</strong> (handicap-adjusted scores). If your buy-in is different (e.g. $22 or $5.50), all amounts scale proportionally.
              </p>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">How it works:</p>
                <ul className="text-sm text-foreground space-y-1 list-disc list-inside">
                  <li>The pot is split between <strong>Gross places</strong>, <strong>Net places</strong>, and <strong>Side Games</strong>.</li>
                  <li>Players are ranked separately for gross and net — a player can only collect one (the higher payout wins if they place in both).</li>
                  <li>Tied scores split the combined prize money for those places equally.</li>
                  <li>Side games (skins, KPs, etc.) have their own separate pool of money, independent of the place payouts.</li>
                </ul>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Payout Chart (at $11 buy-in — scales with your buy-in)</p>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr className="bg-muted/60">
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Players</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Places Paid</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Gross & Net Payouts (each)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SS11_CHART.map((row, i) => (
                        <tr key={row.players} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                          <td className="px-3 py-2 font-medium">{row.players}</td>
                          <td className="px-3 py-2 text-muted-foreground">{row.gross.length}</td>
                          <td className="px-3 py-2">
                            {row.gross.map((amt, j) => (
                              <span key={j} className="mr-2 whitespace-nowrap">
                                <span className="text-muted-foreground">{PLACE_LABELS[j]}:</span> <span className="font-medium text-primary">{amt}</span>
                              </span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-2 italic">* Amounts shown are per gross and net category at $11 buy-in. Buy-ins of $22 double these amounts, $5.50 halves them, etc.</p>
              </div>
            </div>
          )}
        </div>

        {/* CUSTOM */}
        <div>
          <button
            className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-muted/30 transition-colors"
            onClick={() => setOpenMode(openMode === "custom" ? null : "custom")}
          >
            <span className="font-semibold text-sm text-foreground">🎛️ Custom</span>
            {openMode === "custom" ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {openMode === "custom" && (
            <div className="px-5 pb-5 space-y-4">
              <p className="text-sm text-foreground leading-relaxed">
                Custom mode lets <strong>you decide</strong> exactly how the pot is divided. It's great for groups that have their own house rules or prefer a different structure than Fixed Payouts.
              </p>
              <div className="space-y-3">
                <div className="bg-muted/40 rounded-lg p-3 space-y-1">
                  <p className="text-sm font-semibold text-foreground">Step 1 — Split the total pot</p>
                  <p className="text-sm text-muted-foreground">Choose what <strong>% goes to Place Payouts</strong> (gross/net finishes) and what <strong>% goes to Side Games</strong> (skins, KPs, etc.). These two must add up to 100%.</p>
                  <p className="text-xs text-muted-foreground italic">Example: 60% to places, 40% to side games.</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 space-y-1">
                   <p className="text-sm font-semibold text-foreground">Step 2 — Gross vs. Net split</p>
                   <p className="text-sm text-muted-foreground">The place payout pot is split <strong>50/50 between Gross and Net</strong> by default. You can adjust this percentage — if you give more places to Gross, you'll typically want to give a higher percentage of the pot to Gross as well (and vice versa for Net).</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 space-y-1">
                 <p className="text-sm font-semibold text-foreground">Step 3 — How many places are paid?</p>
                 <p className="text-sm text-muted-foreground">Set the <strong>number of spots paid</strong> in gross and net independently (e.g. 2 gross spots and 2 net spots). Payouts use a descending curve so 1st always earns the most.</p>
                 <p className="text-xs text-muted-foreground italic">Example: 2 gross spots + 2 net spots in a 9-player game pays 1st and 2nd in each category.</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 space-y-1">
                  <p className="text-sm font-semibold text-foreground">Payout curve</p>
                  <p className="text-sm text-muted-foreground">Payouts decrease geometrically from 1st to last place, so 1st always gets the most. Tied scores split the combined prize for those places equally.</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 space-y-1">
                  <p className="text-sm font-semibold text-foreground">Conflict rule</p>
                  <p className="text-sm text-muted-foreground">If a player places in both gross and net, they receive only the <strong>higher payout</strong>. The vacated spot is backfilled by the next player in that category.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* OFF */}
        <div>
          <button
            className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-muted/30 transition-colors"
            onClick={() => setOpenMode(openMode === "off" ? null : "off")}
          >
            <span className="font-semibold text-sm text-foreground">📋 Off (Scoring Only)</span>
            {openMode === "off" ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {openMode === "off" && (
            <div className="px-5 pb-5 space-y-3">
              <p className="text-sm text-foreground leading-relaxed">
                Selecting <strong>Off</strong> means <strong>no automatic place payouts</strong> are calculated. The app focuses purely on tracking scores and running any side games you've enabled.
              </p>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">When to use Off:</p>
                <ul className="text-sm text-foreground space-y-1 list-disc list-inside">
                  <li>Your group handles the gross/net payouts manually.</li>
                  <li>You only want to run side games (skins, KPs, deuces) through the app.</li>
                  <li>You're using Swift Score purely as a digital scorecard.</li>
                </ul>
              </div>
              <div className="bg-muted/40 rounded-lg p-3">
                <p className="text-sm text-muted-foreground">The buy-in you enter will still be used to calculate the side game pots (skins, KPs, etc.) if those games are enabled.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Help() {
  const contentRef = useRef();
  const navigate = useNavigate();

  const exportPDF = () => {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 50;
    const maxWidth = pageWidth - margin * 2;
    let y = margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(30, 90, 50);
    doc.text("Swift Score Golf – Game Setup Guide", margin, y);
    y += 30;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("A step-by-step guide to running a golf round with Swift Score.", margin, y);
    y += 30;

    doc.setDrawColor(180, 200, 185);
    doc.line(margin, y, pageWidth - margin, y);
    y += 20;

    // Game Mode section
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(30, 90, 50);
    doc.text("Game Mode Guide", margin, y);
    y += 20;

    const gameModes = [
      {
        title: "Fixed Payouts",
        body: "A ready-to-go payout format based on $11 buy-in per player. The app automatically calculates gross and net place payouts. Amounts scale proportionally with your actual buy-in. Players can only collect one payout (the higher amount if they place in both gross and net). The leftover from the place pot funds side games.",
      },
      {
        title: "Custom",
        body: "Set your own payout split. Divide the total pot between Place Payouts (%) and Side Games (%). The place pot is split 50/50 between gross and net. Set the number of spots paid in each category independently. Payouts decrease from 1st to last place using a geometric curve. If a player places in both gross and net, they receive only the higher payout.",
      },
      {
        title: "Off (Scoring Only)",
        body: "No automatic place payouts are calculated. Use this mode when your group handles gross/net payouts manually, or when you only want to use the app for scorekeeping and side games (skins, KPs, deuces).",
      },
    ];

    gameModes.forEach(mode => {
      if (y > pageHeight - 80) { doc.addPage(); y = margin; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(30, 90, 50);
      doc.text(mode.title, margin, y);
      y += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      const lines = doc.splitTextToSize(mode.body, maxWidth);
      lines.forEach(line => {
        if (y > pageHeight - 60) { doc.addPage(); y = margin; }
        doc.text(line, margin, y);
        y += 13;
      });
      y += 12;
    });

    // SS11 Payout chart
    if (y > pageHeight - 120) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 90, 50);
    doc.text("Fixed Payouts – Payout Chart (at $11 buy-in)", margin, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    SS11_CHART.forEach(row => {
      if (y > pageHeight - 60) { doc.addPage(); y = margin; }
      const payoutStr = row.gross.map((a, i) => `${PLACE_LABELS[i]}: ${a}`).join("  ");
      doc.text(`${row.players} players — ${payoutStr}`, margin, y);
      y += 13;
    });
    y += 16;

    // Steps
    doc.setDrawColor(180, 200, 185);
    doc.line(margin, y, pageWidth - margin, y);
    y += 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(30, 90, 50);
    doc.text("Step-by-Step Instructions", margin, y);
    y += 20;

    steps.forEach((step) => {
      if (y > pageHeight - 100) { doc.addPage(); y = margin; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(30, 90, 50);
      const titleLines = doc.splitTextToSize(step.title, maxWidth);
      doc.text(titleLines, margin, y);
      y += titleLines.length * 16 + 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      const bodyLines = doc.splitTextToSize(step.content, maxWidth);
      bodyLines.forEach((line) => {
        if (y > pageHeight - 60) { doc.addPage(); y = margin; }
        doc.text(line, margin, y);
        y += 14;
      });
      y += 16;
    });

    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text("Swift Score Golf — Scoring & Payout Engine", margin, pageHeight - 30);
    doc.save("SwiftScore-GameSetup.pdf");
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-20 sm:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Game Setup Guide</h1>
          <p className="text-muted-foreground mt-1">How to run a round and understand each game mode.</p>
        </div>
        <Button onClick={exportPDF} className="gap-2 shrink-0">
          <FileDown className="w-4 h-4" />
          Download PDF
        </Button>
      </div>

      <PageDescription
        title=""
        description="Complete guide to all game modes, round setup, score entry, and payout calculations."
      />

      {/* Quick Reference — minimal checklist */}
      <div className="bg-primary/[0.04] border border-primary/25 rounded-xl p-5 shadow-sm">
        <h2 className="text-base font-bold text-primary mb-3">⚡ Quick Reference — Run a Round in 6 Steps</h2>
        <ol className="text-sm text-foreground space-y-2 list-decimal list-inside">
          <li><strong>New Round</strong> — pick a game mode, course, date, buy-in, and player count. Side games (KPs, Skins, Deuce Pot) are also configured here — whether or not they have a separate buy-in.</li>
          <li><strong>Add Players</strong> — type names + handicaps, or pull from your Master Roster.</li>
          <li><strong>Lock Roster</strong> — tap "Lock Roster & Start Scoring" to move to the Scorecard.</li>
          <li><strong>Enter Scores</strong> — Tap, Type, Dictate, or Scan. Scores auto-save as you go.</li>
          <li><strong>Side Games</strong> — KPs, Skins, and Deuce Pot are configured during setup. If a side game has its own separate buy-in, you can select individual participants on the Scorecard (all players are enrolled by default).</li>
          <li><strong>Compute Results</strong> — tap "Compute Results" to get payouts for every player.</li>
        </ol>
        <p className="text-xs text-muted-foreground mt-3 italic">Need tee times or printed scorecards? Use Settings → Tournament Logistics after Step 2.</p>
      </div>

      {/* FAQ link — moved to its own page */}
      <div className="flex justify-center">
        <Button variant="outline" onClick={() => navigate("/Faq")} className="gap-2">
          <HelpCircle className="w-4 h-4" />
          View Frequently Asked Questions →
        </Button>
      </div>

      {/* Game Mode Guide — prominent at top */}
      <GameModeGuide />

      {/* Step-by-step instructions */}
      <div>
        <h2 className="text-lg font-bold text-foreground mb-4">Step-by-Step Instructions</h2>
        <div ref={contentRef} className="space-y-4">
          {steps.map((step, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <h3 className="text-base font-bold text-primary mb-2">{step.title}</h3>
              <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{step.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}