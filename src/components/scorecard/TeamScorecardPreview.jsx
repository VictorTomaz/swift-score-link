import React, { useState } from "react";
import ScorecardHtmlPreview from "@/components/scorecard/ScorecardHtmlPreview";

const MOCK_PAR = [4, 5, 4, 3, 5, 4, 3, 4, 4, 4, 4, 3, 5, 4, 3, 4, 5, 4];
const MOCK_HCP = [7, 1, 11, 17, 3, 13, 15, 5, 9, 14, 8, 2, 18, 10, 6, 16, 4, 12];

const MOCK_PLAYERS = [
  { name: "John Smith", course_handicap: 12, scores: [5, 6, 4, 4, 6, 5, 3, 5, 5, 5, 4, 3, 6, 5, 4, 5, 6, 5] },
  { name: "Jane Doe", course_handicap: 18, scores: [6, 7, 5, 4, 6, 6, 4, 5, 6, 6, 5, 4, 7, 6, 5, 6, 7, 6] },
  { name: "Bob Jones", course_handicap: 8, scores: [5, 5, 4, 3, 5, 4, 3, 4, 4, 4, 4, 3, 5, 4, 3, 4, 5, 4] },
  { name: "Alice Brown", course_handicap: 24, scores: [7, 8, 6, 5, 7, 7, 5, 6, 7, 7, 6, 5, 8, 7, 6, 7, 8, 7] },
];

export default function TeamScorecardPreview() {
  const [playerCount, setPlayerCount] = useState(2);
  const [format, setFormat] = useState("best_ball");

  const mockRound = {
    event_name: "Team Scorecard Preview",
    date: "2026-07-15",
    par: MOCK_PAR,
    hole_handicap_indexes: MOCK_HCP,
    team_mode: true,
    team_size: playerCount,
    team_format: format,
    tee_sheet_config: { group_size: 4 },
  };

  // For 2P: show two 2-man teams (group tags A and B) to demonstrate multi-team
  // within a single tee time. For 3P/4P: single team.
  const mockGroup = playerCount === 2
    ? [
        { ...MOCK_PLAYERS[0], tee_group: "A", tee_time: "08:00" },
        { ...MOCK_PLAYERS[2], tee_group: "A", tee_time: "08:00" },
      ]
    : MOCK_PLAYERS.slice(0, playerCount);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Format:</span>
        <div className="flex gap-1">
          <button
            onClick={() => setFormat("best_ball")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              format === "best_ball"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground hover:bg-muted/80"
            }`}
          >
            Best Ball
          </button>
          <button
            onClick={() => setFormat("scramble")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              format === "scramble"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground hover:bg-muted/80"
            }`}
          >
            Scramble
          </button>
        </div>
        <span className="text-xs font-medium text-muted-foreground ml-2">Team size:</span>
        <div className="flex gap-1">
          {[2, 3, 4].map((n) => (
            <button
              key={n}
              onClick={() => setPlayerCount(n)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                playerCount === n
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground hover:bg-muted/80"
              }`}
            >
              {n}P
            </button>
          ))}
        </div>
      </div>
      <ScorecardHtmlPreview round={mockRound} group={mockGroup} />
      <p className="text-xs text-muted-foreground text-center">
        {playerCount === 2
          ? "Mock data — One 2-man team on its own scorecard. Each team gets its own Gross/Net best-ball rows."
          : format === "scramble"
          ? "Mock data — Scramble: one team gross score per hole (no individual score rows). Green = team gross."
          : "Mock data — Best Ball: individual rows + Gross and Net best-ball rows. Green = best gross, Blue = best net."}
      </p>
    </div>
  );
}