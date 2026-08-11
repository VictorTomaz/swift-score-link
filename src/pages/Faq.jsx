import React from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PageDescription from "@/components/PageDescription";

const faqItems = [
  {
    question: "Do I have to log in every time I open the app?",
    answer: "No! Once you log in the first time, the app remembers you. Your session is saved automatically, so you'll be taken directly to your Dashboard every time you open the app. You only need to log in again if you explicitly sign out.",
  },
  {
    question: "How long does my login session last?",
    answer: "Your session is designed to last for weeks or months. It will only expire if you clear your browser cache, manually sign out, or if we make a major security update to the platform.",
  },
  {
    question: "What if I lose my phone or device?",
    answer: "Simply log in on your new device with your email and password. Your account and all your round history are securely stored and will be available on any device.",
  },
  {
    question: "How do I scan a physical scorecard?",
    answer: "On the Scorecard page, tap the 'Scan Scorecard' button (camera icon). Take a photo of the printed scorecard — make sure all four corners are visible and the card is flat. The app will automatically extract player names and scores. Review the extracted data in the preview modal, then tap 'Save' to import it into the round.",
  },
  {
    question: "How do I print scorecards for my players?",
    answer: "Go to Tournament Logistics (from the Settings menu or Dashboard). Select a round, then tap 'Generate Scorecards'. A printable PDF opens — scorecards are stacked two per page with a dashed cut line, grouped by tee time. Player names, course handicaps, par, and handicap indexes are pre-filled, and score cells are blank for manual entry. Need a completely blank one? Tap 'Blank Scorecard' for a generic scorecard with only the course info.",
  },
  {
    question: "When I regenerate scorecards, which version opens?",
    answer: "Every time you generate a scorecard, the new PDF's link is saved directly to that round, and the app always opens the most recently generated version. So you'll never accidentally pull up a stale or cached scorecard from an earlier run — the latest one is always what you see.",
  },
  {
    question: "How do tee times and tee sheets work?",
    answer: "In Tournament Logistics, set your start time, interval, and group size, then tap 'Generate' to auto-assign tee times using one of several shuffling algorithms, or tap a player then a time slot to place them manually. You can also tag players with a group label (A, B, C…) for scorecard grouping. Tap 'Print' to produce a tee sheet PDF, or 'To Me' to email the assignments to your players.",
  },
  {
    question: "Do I need to set up tee times, or can I just use scorecards?",
    answer: "You don't need a full tee sheet, but you do need at least a basic tee time assignment — the scorecard generator groups players by tee time, so without any tee times set the cards come out blank (no player names). The simplest approach: in Tournament Logistics, set a start time and group size, then tap 'Generate' to auto-assign tee times. That creates the groupings the scorecard needs. Then tap 'Generate Scorecards' and each group gets its own pre-filled card with player names, course handicaps, par, and handicap indexes, plus blank score cells. You can skip printing the tee sheet itself if your group doesn't need it.",
  },
  {
    question: "What's the best way to photograph a scorecard for scanning?",
    answer: "For best results: (1) Turn on your camera's Grid setting to keep the phone parallel to the card. (2) Use good, even lighting with no shadows. (3) Keep the card flat on a table. (4) Don't zoom — move closer instead. (5) Avoid Macro mode (yellow flower icon) as it can distort the edges. The corner dots on printed scorecards help the scanner align accurately.",
  },
];

export default function Faq() {
  const navigate = useNavigate();

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20 sm:pb-0">
      <Button variant="ghost" onClick={() => navigate("/Help")} className="gap-2">
        <ChevronLeft className="w-4 h-4" /> Back to Help
      </Button>

      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Frequently Asked Questions</h1>
        <p className="text-muted-foreground mt-1">Quick answers to common questions about using Swift Score Golf.</p>
      </div>

      <PageDescription
        title=""
        description="Can't find what you're looking for? Check the full Game Setup Guide on the Help page."
      />

      <div className="space-y-3">
        {faqItems.map((item, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <h3 className="text-base font-bold text-primary mb-2">{item.question}</h3>
            <p className="text-sm text-foreground leading-relaxed">{item.answer}</p>
          </div>
        ))}
      </div>
    </div>
  );
}