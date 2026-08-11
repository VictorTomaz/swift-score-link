import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Layers, ChevronDown, ChevronRight, PlusCircle, Edit, Trophy, CalendarDays } from "lucide-react";

/**
 * Renders a multi-flight tournament as a single expandable card on the Dashboard.
 * Collapsed: shows tournament name, flight count, total players/pot.
 * Expanded: shows each flight as a clickable row + action buttons.
 *
 * Does NOT change any data — it's a display-only aggregation layer over the
 * existing parent/child round structure.
 */
export default function TournamentGroupCard({ group, isCompleted, onEdit }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const parentRound = group.find(r => !r.parent_round_id) || group[0];
  const parentId = parentRound.id;
  const tournamentName = parentRound.event_name;
  // Within a flight, the SAME players play across multiple days, so summing
  // player_count across all rounds double-counts (24+24=48). Instead, take one
  // count per flight (the max across its days) and sum across flights.
  const flightPlayerCounts = {};
  group.forEach(r => {
    const fn = r.flight_number || 1;
    flightPlayerCounts[fn] = Math.max(flightPlayerCounts[fn] || 0, r.player_count || 0);
  });
  const totalPlayers = Object.values(flightPlayerCounts).reduce((s, c) => s + c, 0);
  const totalPot = group.reduce((s, r) => s + ((r.buy_in || 0) * (r.player_count || 0)), 0);
  const linkBase = isCompleted ? "/Results" : "/Scorecard";
  const finalRound = group[group.length - 1];
  // Flight count = number of distinct flight_numbers, NOT total rounds.
  // A multi-day tournament can have multiple rounds per flight (Day 1, Day 2…),
  // so group.length over-counts. Default to 1 when flight_number is unset.
  const flightCount = new Set(group.map(r => r.flight_number || 1)).size;

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-0">
        {/* Header — click to expand/collapse */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full p-3.5 flex items-center justify-between gap-2 text-left"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-logistics/20 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4 text-logistics" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground text-sm truncate">{tournamentName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {flightCount > 1 && `${flightCount} Flights · `}{totalPlayers} players · ${totalPot.toLocaleString()} pot
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {flightCount > 1 && <Badge variant="secondary" className="text-xs bg-logistics/20 text-logistics">{flightCount} Flights</Badge>}
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
          </div>
        </button>

        {/* Expanded flight list */}
        {expanded && (
          <div className="border-t border-border px-3.5 py-2 space-y-1">
            {group.map((round, idx) => (
              <div
                key={round.id}
                className="flex items-center justify-between gap-2 py-1.5 cursor-pointer hover:bg-muted/50 rounded-md px-2 -mx-2"
                onClick={() => navigate(`${linkBase}?id=${round.id}`)}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">
                    Flight {round.flight_number || idx + 1}
                  </span>
                  <span className="text-sm text-foreground truncate">{round.event_name}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-muted-foreground">{round.player_count || 0}p</span>
                  <Badge variant="secondary" className="capitalize text-xs">{round.status}</Badge>
                  <button
                    onClick={(e) => { e.stopPropagation(); onEdit(round); }}
                    className="flex items-center gap-1 text-xs text-edit-foreground bg-edit hover:bg-edit/90 border border-edit rounded-md px-2 py-1 transition-colors"
                  >
                    <Edit className="w-3 h-3" />
                  </button>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            ))}

            {/* Per-flight "Add Day" buttons — shown for multi-day or hybrid
                tournaments, EVEN when all current rounds are completed.
                Completing Day 1 of a flight doesn't mean the series is over —
                the user needs to add Day 2 regardless. */}
            {(() => {
              const isMultiDay = group.some(r => r.is_multi_day || r.is_multi_flight);
              if (!isMultiDay) return null;
              // Group by flight_number and find the latest round in each flight
              const flightMap = {};
              group.forEach(r => {
                const fn = r.flight_number || 1;
                if (!flightMap[fn] || new Date(r.date) > new Date(flightMap[fn].date)) {
                  flightMap[fn] = r;
                }
              });
              return Object.values(flightMap)
                .sort((a, b) => (a.flight_number || 1) - (b.flight_number || 1))
                .map(r => (
                  <button
                    key={`addday-${r.id}`}
                    onClick={() => navigate(`/SetupWizard?addDay=${r.id}`)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 mt-1 rounded-md bg-logistics/10 hover:bg-logistics/20 text-logistics text-xs font-semibold transition-colors"
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                    Add Day → Flight {r.flight_number || 1}
                  </button>
                ));
            })()}

            {/* Combined Results — navigates to the final flight's Results page,
                which computes field standings across all flights */}
            {isCompleted && (
              <button
                onClick={() => navigate(`/Results?id=${finalRound.id}`)}
                className="w-full flex items-center justify-center gap-1.5 py-2 mt-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors"
              >
                <Trophy className="w-3.5 h-3.5" />
                Combined Results
              </button>
            )}

            {/* Add Flight — opens Setup Wizard in Add Flight mode (inherits settings) */}
            {!isCompleted && (
              <button
                onClick={() => navigate(`/SetupWizard?addFlight=${parentId}`)}
                className="w-full flex items-center justify-center gap-1.5 py-2 mt-1 rounded-md bg-logistics/10 hover:bg-logistics/20 text-logistics text-xs font-semibold transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Add Flight {flightCount + 1}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}