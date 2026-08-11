import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

const pageNames = {
  "/Dashboard": "DASHBOARD",
  "/NewRound": "NEW ROUND",
  "/Results": "RESULTS",
  "/History": "HISTORY",
  "/CoursesManagement": "COURSES",
  "/PlayersManagement": "PLAYERS",
  "/TeeSheet": "TEE SHEET",
  "/PrintScorecards": "PRINT SCORECARDS",
  "/Help": "GAME SETUP",
  "/TermsAndPrivacy": "TERMS & PRIVACY",
};

export default function PageHeader() {
  const location = useLocation();
  const [pageName, setPageName] = useState(pageNames[location.pathname] || "PAGE");

  useEffect(() => {
    if (location.pathname === "/Scorecard") {
      const urlParams = new URLSearchParams(window.location.search);
      const roundId = urlParams.get("id");

      if (!roundId) {
        setPageName("ROSTER SETUP");
        return;
      }

      let cancelled = false;

      const updateHeader = async () => {
        if (cancelled) return;
        try {
          const rounds = await base44.entities.Round.filter({ id: roundId });
          if (cancelled) return;
          if (!rounds || rounds.length === 0) {
            setPageName("ROSTER SETUP");
            return;
          }
          const round = rounds[0];
          if (round?.status === "scoring") {
            setPageName("ENTER SCORES");
          } else if (round?.status === "completed") {
            setPageName("SCORECARD");
          } else {
            setPageName("ROSTER SETUP");
          }
        } catch {
          if (!cancelled) setPageName("ROSTER SETUP");
        }
      };

      updateHeader();

      const unsubscribe = base44.entities.Round.subscribe((event) => {
        if (event.id === roundId) {
          updateHeader();
        }
      });

      return () => {
        cancelled = true;
        unsubscribe();
      };
    } else {
      setPageName(pageNames[location.pathname] || "PAGE");
    }
  }, [location.pathname, location.search]);

  return (
    <div className="py-4 mb-4 bg-primary" style={{ flexShrink: 0 }}>
      <div className="max-w-7xl mx-auto px-4">
        <h1 className="text-lg font-bold tracking-tight text-center text-white">{pageName || "APP"}</h1>
      </div>
    </div>
  );
}