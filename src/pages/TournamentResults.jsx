import React, { useEffect, useMemo, useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, Trophy, Send, Calendar, RefreshCw, Loader2 } from "lucide-react";
import { recomputeRoundResults, hasMissingSideGames, hasStaleFlightScores } from "@/lib/recomputeResults";
import { format } from "date-fns";
import GrossNetResults from "@/components/results/GrossNetResults";
import TeamStandings from "@/components/results/TeamStandings";
import PayoutTable from "@/components/results/PayoutTable";
import SideGamesSection from "@/components/results/SideGamesSection";
import SideGamesByType from "@/components/results/SideGamesByType";
import { buildTeamNameByPlayer } from "@/lib/teamPlayerLookup";
import FlightStandings from "@/components/results/FlightStandings";
import FieldPrizesCard from "@/components/results/FieldPrizesCard";
import SendResultsModal from "@/components/results/SendResultsModal";
import ResultsSection from "@/components/results/ResultsSection";
import PageDescription from "@/components/PageDescription";
import InfoTooltip from "@/components/InfoTooltip";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Tournament-level final results — a single read-only view of the combined
 * standings, field prizes, per-flight results, side games, and final payouts
 * for an entire multi-flight / multi-day tournament. The combined results are
 * computed on the final flight's final day (as today); this page simply finds
 * that round and displays its saved results, so the final results are
 * accessible from one place regardless of which flight finished last.
 */
export default function TournamentResults() {
  const urlParams = new URLSearchParams(window.location.search);
  const roundId = urlParams.get("id");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [isRecomputing, setIsRecomputing] = useState(false);
  const hasAutoRecomputed = useRef(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  // Load the full series (parent + all children) via the backend function.
  // Passing the parent id works because getSeriesRounds derives the anchor
  // from parent_round_id || id.
  // The function's service-role filter intermittently returns empty in the
  // Deno runtime — when that happens, the function returns only the parent
  // round, and the round with is_series_cumulative (the final round) is
  // missing. Fall back to fetching children directly via user context so
  // the Combined Results page reliably finds the final round.
  const { data: seriesRounds = [], isLoading } = useQuery({
    queryKey: ["tournament-series", roundId],
    queryFn: async () => {
      let rounds = [];
      try {
        const res = await base44.functions.invoke("getSeriesRounds", { roundId });
        const data = res?.data || res;
        rounds = data?.rounds || [];
      } catch (e) { /* fall back below */ }
      // If the function returned only the parent (children fetch failed),
      // fetch children directly via user context and merge.
      if (rounds.length <= 1) {
        try {
          const children = await base44.entities.Round.filter({ parent_round_id: roundId }, '-created_date', 200);
          let parent = rounds[0];
          if (!parent) {
            try { parent = await base44.entities.Round.get(roundId); }
            catch (e) { parent = null; }
          }
          const all = [parent, ...children].filter(Boolean);
          const seen = new Set();
          rounds = all.filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)));
        } catch (e2) { /* keep whatever we have */ }
      }
      return rounds;
    },
    enabled: !!roundId,
  });

  // The round carrying the combined final results (is_series_cumulative).
  // Every unique player across all flights/days — used for sending results
  const allTournamentPlayers = useMemo(() => {
    const byKey = new Map();
    (seriesRounds || []).forEach(r => {
      (r.players || []).forEach(p => {
        const key = p.player_id || p.name;
        if (key && !byKey.has(key)) byKey.set(key, p);
      });
    });
    return Array.from(byKey.values());
  }, [seriesRounds]);

  const finalRound = useMemo(() => {
    if (!seriesRounds || seriesRounds.length === 0) return null;
    return seriesRounds.find(r => r.results?.is_series_cumulative) || null;
  }, [seriesRounds]);

  const parentRound = useMemo(() => {
    if (!seriesRounds || seriesRounds.length === 0) return null;
    return seriesRounds.find(r => !r.parent_round_id) || seriesRounds[0];
  }, [seriesRounds]);

  const isHybrid = !!(parentRound?.is_multi_day && parentRound?.is_multi_flight);
  const isMultiFlight = !!(parentRound?.is_multi_flight || parentRound?.series_type === 'multi_flight');

  // Auto-recompute when the final round's combined payouts are missing side
  // game data (skins, deuces) that exists in sibling rounds. The pre-fix
  // computation didn't carry these into the combined payouts, so stale saved
  // results need a fresh recompute to populate them.
  const needsSideGameRecompute = useMemo(() => {
    return !isLoading && !!finalRound && (
      hasMissingSideGames(finalRound, seriesRounds) ||
      hasStaleFlightScores(finalRound, seriesRounds)
    );
  }, [isLoading, finalRound, seriesRounds]);

  useEffect(() => {
    if (needsSideGameRecompute && !hasAutoRecomputed.current && !isRecomputing) {
      hasAutoRecomputed.current = true;
      setIsRecomputing(true);
      recomputeRoundResults(finalRound.id, { silent: true })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["tournament-series", roundId] });
        })
        .catch((e) => console.error("[TournamentResults] Auto-recompute failed:", e.message))
        .finally(() => setIsRecomputing(false));
    }
  }, [needsSideGameRecompute, isRecomputing, finalRound, roundId, queryClient]);

  // Per-flight standings — prefer the pre-built all_flight_standings from the
  // combined results (hybrid); fall back to each flight's own saved results.
  const flightResultsList = useMemo(() => {
    if (!seriesRounds || seriesRounds.length === 0) return [];
    const results = finalRound?.results || {};
    if (results.all_flight_standings?.length > 0) {
      // Build a flight_number → flight_name + round lookup from the series rounds
      const fnToFlightName = {};
      const fnToRound = {};
      seriesRounds.forEach(r => {
        const fn = String(r.flight_number || 1);
        if (!fnToFlightName[fn] && r.flight_name) fnToFlightName[fn] = r.flight_name;
        if (!fnToRound[fn]) fnToRound[fn] = r;
      });
      return results.all_flight_standings
        .sort((a, b) => (a.flightNumber || 0) - (b.flightNumber || 0))
        .map(fs => {
          // Pull team standings from the actual flight's saved results so
          // team events show team standings (not individual player scores).
          const actualRes = fnToRound[String(fs.flightNumber)]?.results || {};
          return {
            round: { id: `standings_${fs.flightNumber}`, event_name: fnToFlightName[String(fs.flightNumber)] || `Flight ${fs.flightNumber}`, course_name: finalRound.course_name, game_type: finalRound.game_type, team_mode: finalRound.team_mode },
            results: {
              gross_results: fs.gross_results,
              net_results: fs.net_results,
              team_gross_results: fs.team_gross_results || actualRes.team_gross_results,
              team_net_results: fs.team_net_results || actualRes.team_net_results,
            },
            flightLabel: fnToFlightName[String(fs.flightNumber)] || `Flight ${fs.flightNumber}`,
            flightNumber: String(fs.flightNumber),
          };
        });
    }
    if (isMultiFlight) {
      const sorted = [...seriesRounds].sort((a, b) => new Date(a.date) - new Date(b.date));
      return sorted.map((r, i) => {
        const rRes = r.results || {};
        return {
          round: r,
          // The final flight's saved results hold the COMBINED field standings
          // (all flights' players). Its own 12-player standings are preserved
          // as flight_own_gross/net — use those so each flight card shows only
          // that flight's players, not the whole field.
          results: {
            ...rRes,
            gross_results: rRes.flight_own_gross || rRes.gross_results,
            net_results: rRes.flight_own_net || rRes.net_results,
          },
          flightLabel: r.flight_name || `Flight ${r.flight_number || i + 1}`,
          flightNumber: String(r.flight_number || i + 1),
        };
      });
    }
    return [];
  }, [finalRound, isMultiFlight, seriesRounds]);

  // Player → flight map. Built primarily from each round's ROSTER, which is
  // ground truth and always present — a player belongs to the flight whose
  // round they're listed in. The saved player_flight_map (from the combined
  // compute) is only a fallback for anyone missing from every roster, so a
  // stale or absent map can never make payouts disappear from the tables.
  const playerFlightPayoutMap = useMemo(() => {
    const map = { ...(finalRound?.results?.player_flight_map || {}) };
    seriesRounds.forEach(r => {
      const fn = String(r.flight_number || 1);
      (r.players || []).forEach(p => {
        if (p.player_id) map[p.player_id] = fn;
      });
    });
    return map;
  }, [finalRound, seriesRounds]);

  // Tournament-wide player → team lookup, so pooled KP winners from other
  // flights/days still display (and split) as teams.
  const teamNameByPlayer = useMemo(() => buildTeamNameByPlayer(seriesRounds), [seriesRounds]);

  // Flight number → display label (event name) for grouping KP winners by flight.
  const flightLabels = useMemo(() => {
    const map = {};
    seriesRounds.forEach(r => {
      const fn = String(r.flight_number || 1);
      if (!map[fn]) map[fn] = r.flight_name || `Flight ${fn}`;
    });
    return map;
  }, [seriesRounds]);

  // "flight-date" → "Flight Name · Day N" label for grouping KP winners by flight+day.
  const flightDayLabels = useMemo(() => {
    const map = {};
    seriesRounds.forEach(r => {
      const fn = String(r.flight_number || 1);
      const flightRounds = seriesRounds
        .filter(rr => String(rr.flight_number || 1) === fn)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      const dayIdx = flightRounds.findIndex(rr => rr.id === r.id);
      map[`${fn}-${r.date}`] = `${flightLabels[fn] || `Flight ${fn}`} · Day ${dayIdx + 1}`;
    });
    return map;
  }, [seriesRounds, flightLabels]);

  // Per-flight payouts — split the combined payouts array by flight.
  const perFlightPayouts = useMemo(() => {
    if (!finalRound || flightResultsList.length === 0) return [];
    const res = finalRound.results || {};
    // Secondary lookup: which flight's displayed standings a player appears in.
    // Covers players missing from both the roster map and the saved map, so no
    // payout row is ever silently dropped from every flight table.
    const standingsFlight = {};
    flightResultsList.forEach(fr => {
      [...(fr.results?.gross_results || []), ...(fr.results?.net_results || [])].forEach(r => {
        if (r.player_id && !standingsFlight[r.player_id]) standingsFlight[r.player_id] = fr.flightNumber;
      });
    });
    return flightResultsList.map(fr => {
      const fn = fr.flightNumber || (fr.flightLabel || '').replace('Flight ', '').trim();
      const flightPayouts = (res.payouts || []).filter(p =>
        (playerFlightPayoutMap[p.player_id] || standingsFlight[p.player_id]) === fn
      );
      return {
        flightLabel: fr.flightLabel,
        flightResults: { ...res, payouts: flightPayouts },
      };
    });
  }, [finalRound, flightResultsList, playerFlightPayoutMap]);

  if (isLoading || isRecomputing) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 pb-20 pt-20">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <p className="text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          {isRecomputing ? "Recomputing results with side games..." : "Loading tournament results..."}
        </p>
      </div>
    );
  }

  if (!finalRound) {
    const sortedRounds = [...seriesRounds].sort((a, b) => new Date(a.date) - new Date(b.date));
    const firstDate = sortedRounds[0]?.date;
    const dateLabel = firstDate ? format(new Date(firstDate.replace(/-/g, '/')), "MMM d, yyyy") : "";
    const flightCount = new Set(seriesRounds.map(r => r.flight_number || 1)).size;
    // Find the last flight's latest round — the user finalizes the tournament
    // there by toggling "Final Day" on that round's Results page.
    const lastFlightRound = (() => {
      const completed = seriesRounds.filter(r => r.status === "completed");
      const pool = completed.length > 0 ? completed : seriesRounds;
      if (pool.length === 0) return null;
      return pool.reduce((best, r) => {
        const rFn = r.flight_number || 1;
        const bFn = best.flight_number || 1;
        if (rFn !== bFn) return rFn > bFn ? r : best;
        return new Date(r.date) > new Date(best.date) ? r : best;
      }, pool[0]);
    })();
    return (
      <TooltipProvider>
        <div className="max-w-3xl mx-auto space-y-6 pb-20 sm:pb-0">
          <PageDescription
            title="Tournament Results"
            description="Combined final results will appear here once the tournament is finalized. Below are the current per-flight standings."
          />
          <div className="flex items-center gap-2">
            <Button variant="edit" size="sm" onClick={() => navigate("/Dashboard")} className="gap-2">
              <ChevronLeft className="w-4 h-4" />
              Dashboard
            </Button>
            {lastFlightRound && (
              <Button
                variant="default"
                size="sm"
                onClick={() => navigate(`/Results?id=${lastFlightRound.id}`)}
                className="gap-2"
              >
                <Trophy className="w-4 h-4" />
                Finalize Tournament
              </Button>
            )}
          </div>
          <Card className="border-0 shadow-sm bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <Trophy className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-foreground">{parentRound?.event_name || "Tournament"}</p>
                  {dateLabel && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3" />
                      {dateLabel}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {flightCount > 1 && `${flightCount} Flights · `}In progress — combined payouts held until final day
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          {flightResultsList.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-bold text-foreground">Per-Flight Standings</p>
              {flightResultsList.map(fr => (
                <FlightStandings
                  key={fr.round.id}
                  round={fr.round}
                  results={fr.results}
                  flightLabel={fr.flightLabel}
                  holdMainPayouts
                  forceStacked
                  placesCount={Math.max(fr.results.gross_places?.length || 3, fr.results.net_places?.length || 3)}
                />
              ))}
            </div>
          )}
          {sortedRounds.map(r => (
            <SideGamesSection
              key={r.id}
              round={r}
              results={r.results || {}}
              dayLabel={isMultiFlight ? (r.flight_name || `Flight ${r.flight_number || 1}`) : `Day ${sortedRounds.findIndex(rr => rr.id === r.id) + 1}`}
              suppressKP={isMultiFlight && !isHybrid}
              teamNameByPlayer={teamNameByPlayer}
            />
          ))}
        </div>
      </TooltipProvider>
    );
  }

  const results = finalRound.results || {};

  // Hybrid: split the pooled KP winners by day so each day's side games
  // section shows only that day's KP winners (per flight), instead of one
  // consolidated card grouping all winners by flight+day. KP is pooled
  // tournament-wide, so both the per-entry payout AND the pot total shown
  // must be the pooled tournament-wide figures — showing this day's own
  // buy-in contribution next to a pooled per-winner amount is misleading
  // (a small day/flight pot next to a share computed from the full pot).
  const pooledKpPerEntry = results.kp_per_entry_amount || 0;
  const pooledKpPot = results.kp_separate_pot || 0;
  const buildHybridDayResults = (round, dayResults) => {
    if (!isHybrid) return dayResults;
    const fn = String(round.flight_number || 1);
    const date = round.date;
    const dayKp = (results.kp_results || []).filter(kp =>
      String(kp.flight || 1) === fn && kp.date === date
    );
    return {
      ...dayResults,
      kp_results: dayKp,
      kp_per_entry_amount: pooledKpPerEntry,
      kp_separate_pot: pooledKpPot,
    };
  };

  // The combined results overwrite the skins pots with tournament-wide totals
  // (sum across all flights), but the skins listed in the final day's section
  // are only THIS flight's. Override with this flight's own pot so the header
  // matches the payouts below it. The labeled pot breakdown above still shows
  // the combined tournament totals.
  const finalDaySideResults = (baseResults) => ({
    ...baseResults,
    gross_skins_allocated_pot: results.flight_own_gross_skins_pot
      || (results.gross_skins || []).reduce((s, k) => s + (k.value || 0), 0),
    net_skins_allocated_pot: results.flight_own_net_skins_pot
      || (results.net_skins || []).reduce((s, k) => s + (k.value || 0), 0),
    gross_skins_separate_pot: 0,
    net_skins_separate_pot: 0,
    // Same for the deuce pot — the combined value is the tournament-wide sum,
    // but only this flight's deuce winners are listed here.
    deuce_pot: results.flight_own_deuce_pot
      || ((results.deuces || []).length * (results.deuce_per_entry_amount || 0)),
  });

  const tournamentName = parentRound?.event_name || finalRound.event_name || "Tournament";
  const sortedRounds = [...seriesRounds].sort((a, b) => new Date(a.date) - new Date(b.date));
  const firstDate = sortedRounds[0]?.date;
  const lastDate = sortedRounds[sortedRounds.length - 1]?.date;
  const dateRange = firstDate
    ? (sortedRounds.length > 1 && firstDate !== lastDate
        ? `${format(new Date(firstDate.replace(/-/g, '/')), "MMM d")} – ${format(new Date(lastDate.replace(/-/g, '/')), "MMM d, yyyy")}`
        : format(new Date(firstDate.replace(/-/g, '/')), "MMM d, yyyy"))
    : "";
  const flightCount = new Set(seriesRounds.map(r => r.flight_number || 1)).size;
  // Deuce pot settles per-day; the combined results don't carry a total, so sum
  // each day's deuce_pot across the series for the pot-breakdown line item.
  const totalDeucePot = seriesRounds.reduce((sum, r) => sum + (r.results?.deuce_pot || 0), 0);

  // Side game entries ordered day-then-flight, each carrying its own label and
  // per-day results. Grouped by game type in the UI (skins → KPs → deuces).
  const sideGameEntries = [...sortedRounds]
    .sort((a, b) => (new Date(a.date) - new Date(b.date)) || ((a.flight_number || 1) - (b.flight_number || 1)))
    .map((r) => {
      const isFinal = r.id === finalRound.id;
      const dayLabelFor = () => {
        if (isHybrid) {
          const fn = r.flight_number || 1;
          const flightRounds = sortedRounds.filter(rr => (rr.flight_number || 1) === fn)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
          return `Day ${flightRounds.findIndex(rr => rr.id === r.id) + 1} · ${flightLabels[String(fn)] || `Flight ${fn}`}`;
        }
        if (isMultiFlight) return flightLabels[String(r.flight_number || 1)] || `Flight ${r.flight_number || 1}`;
        return `Day ${sortedRounds.findIndex(rr => rr.id === r.id) + 1}`;
      };
      const base = r.results || {};
      const res = isFinal
        ? finalDaySideResults(isHybrid ? buildHybridDayResults(r, results) : results)
        : (isHybrid ? buildHybridDayResults(r, base) : base);
      return {
        key: r.id,
        label: dayLabelFor(),
        round: r,
        results: res,
        suppressKP: !isFinal && isMultiFlight && !isHybrid,
        playerFlightMap: isFinal && !isHybrid ? playerFlightPayoutMap : null,
        flightLabels: isFinal && !isHybrid ? flightLabels : null,
        flightDayLabels: isFinal && !isHybrid ? flightDayLabels : null,
      };
    });

  const potItems = [
    // Multi-flight: gross_pot/net_pot are tournament-wide sums, so the derived
    // gross_places/net_places are combined-pot amounts nobody is actually paid
    // (each flight pays its own pot). Hide the place breakdown there — the
    // per-flight Final Payouts tables below carry the real amounts.
    ...(results.gross_pot > 0 ? [{ label: isMultiFlight ? "Gross Pot (all flights)" : "Gross Pot", value: results.gross_pot, places: isMultiFlight ? null : results.gross_places, tip: isMultiFlight ? "Combined gross pot across all flights. Each flight pays its own gross pot — see that flight's Final Payouts below." : "The portion of the main pot allocated to gross score (raw stroke) standings." }] : []),
    ...(results.net_pot > 0 ? [{ label: isMultiFlight ? "Net Pot (all flights)" : "Net Pot", value: results.net_pot, places: isMultiFlight ? null : results.net_places, tip: isMultiFlight ? "Combined net pot across all flights. Each flight pays its own net pot — see that flight's Final Payouts below." : "The portion of the main pot allocated to net score (handicap-adjusted) standings." }] : []),
    ...(isMultiFlight && results.field_gross_prize > 0 ? [{ label: "Field Gross", value: results.field_gross_prize, tip: "Percentage of the combined gross pot awarded to the overall Low Gross player across all flights." }] : []),
    ...(isMultiFlight && results.field_net_prize > 0 ? [{ label: "Field Net", value: results.field_net_prize, tip: "Percentage of the combined net pot awarded to the overall Low Net player across all flights." }] : []),
    ...(results.side_pot > 0 ? [{ label: "Side Games", value: results.side_pot, tip: "Pot allocated to side games like skins and KPs that are part of the main buy-in." }] : []),
    ...(results.kp_separate_pot > 0 ? [{ label: "KP Pot", value: results.kp_separate_pot, tip: "Separate pot funded by KP buy-ins. Split among closest-to-the-pin winners." }] : []),
    ...(results.gross_skins_separate_pot > 0 ? [{ label: "Gross Skins", value: results.gross_skins_separate_pot, tip: "Separate pot funded by gross skins buy-ins." }] : []),
    ...(results.net_skins_separate_pot > 0 ? [{ label: "Net Skins", value: results.net_skins_separate_pot, tip: "Separate pot funded by net skins buy-ins." }] : []),
    ...((results.deuce_pot || totalDeucePot) > 0 ? [{ label: "Deuce Pot", value: results.deuce_pot || totalDeucePot, tip: "Separate pot funded by deuce buy-ins. Split among players who make a 2 on a par-3." }] : []),
    ...((results.added_money || parentRound?.added_money) > 0 ? [{ label: results.added_money_label || parentRound?.added_money_label || "Added Money", value: results.added_money || parentRound?.added_money || 0, tip: "Lump sum folded into the main gross/net pot. For multi-flight tournaments, splits across flights proportionally by player count." }] : []),
    { label: "Total Pot", value: results.total_pot, isTotal: true, tip: "Total tournament pot from all player buy-ins plus added money, across all flights." },
  ];

  return (
    <TooltipProvider>
      <div className="max-w-3xl mx-auto space-y-6 pb-20 sm:pb-0">
        <PageDescription
          title="Tournament Final Results"
          description="Combined standings, field prizes, and final payouts across all flights and days of this tournament."
        />

        <div className="flex items-center gap-2">
          <Button variant="edit" size="sm" onClick={() => navigate("/Dashboard")} className="gap-2">
            <ChevronLeft className="w-4 h-4" />
            Dashboard
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setSendModalOpen(true)} className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
            <Send className="w-4 h-4" />
            Send Results
          </Button>
          {finalRound && (
            <Button
              variant="default"
              size="sm"
              disabled={isRecomputing}
              onClick={async () => {
                setIsRecomputing(true);
                try {
                  await recomputeRoundResults(finalRound.id, { silent: false });
                  await queryClient.invalidateQueries({ queryKey: ["tournament-series", roundId] });
                } catch (e) {
                  console.error("[TournamentResults] Recompute failed:", e.message);
                } finally {
                  setIsRecomputing(false);
                }
              }}
              className="gap-2"
            >
              {isRecomputing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Recompute
            </Button>
          )}
        </div>

        {/* Tournament header */}
        <Card className="border-0 shadow-sm bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Trophy className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-foreground">{tournamentName}</p>
                {dateRange && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3 h-3" />
                    {dateRange}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {flightCount > 1 && `${flightCount} Flights · `}{seriesRounds.length} Round{seriesRounds.length > 1 ? "s" : ""} · ${Math.round(results.total_pot || 0).toLocaleString()} Total Pot
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Per-Flight Results — leads the page */}
        {flightResultsList.length > 0 && (
          <div className="space-y-3">
            {flightResultsList.map(fr => (
              <FlightStandings
                key={fr.round.id}
                round={fr.round}
                results={fr.results}
                flightLabel={fr.flightLabel}
                payouts={results.payouts}
                holdMainPayouts={false}
                forceStacked
                placesCount={Math.max(results.gross_places?.length || 3, results.net_places?.length || 3)}
              />
            ))}
          </div>
        )}

        {/* Pot breakdown */}
        {results.total_pot > 0 && (
          <ResultsSection title="Pot Breakdown" subtitle={`$${Math.round(results.total_pot || 0).toLocaleString()} total pot`}>
            <div className="grid grid-cols-3 gap-2 pt-1">
              {potItems.map(item => (
                <Card key={item.label} className={`border-0 shadow-sm ${item.isTotal ? 'bg-primary/10 border border-primary/30' : ''}`}>
                  <CardContent className="p-3 text-center">
                    <p className={`text-[10px] font-medium flex items-center justify-center gap-0.5 ${item.isTotal ? 'text-primary' : 'text-muted-foreground'}`}>
                      {item.label}{item.tip && <InfoTooltip text={item.tip} />}
                    </p>
                    <p className={`font-bold mt-0.5 ${item.isTotal ? 'text-primary text-lg' : 'text-foreground text-base'}`}>${Math.round(item.value || 0)}</p>
                    {item.places && item.places.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-1">{item.places.map(p => `$${Math.round(p)}`).join(' + ')}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </ResultsSection>
        )}

        {/* Standings — field-wide, field prizes, and per-flight */}
        <ResultsSection
          title={isMultiFlight ? "Field Standings" : "Gross & Net Standings"}
          subtitle={isMultiFlight ? "All players across every flight, plus field prizes" : "Full gross and net leaderboards"}
        >
          <div className="pt-1">
            <FlightStandings
              round={finalRound}
              results={results}
              flightLabel={finalRound?.flight_name || tournamentName}
              payouts={results.payouts}
              holdMainPayouts={false}
              forceStacked
            />
          </div>

          {isMultiFlight && (results.field_gross_winner || results.field_net_winner) && (
            <FieldPrizesCard results={results} />
          )}

        </ResultsSection>

        {/* Side games — skins, KPs, deuces across every day/flight.
            For non-hybrid multi-flight, KP is tournament-wide so it's
            suppressed on prior days and shown once on the final day's
            section from the combined results. For hybrid, each day shows
            its own KP winners (per flight) with the pooled per-entry amount. */}
        <ResultsSection title="Side Games" subtitle="Grouped by game — skins, KPs, then deuce pot">
          <div className="pt-1">
            <SideGamesByType entries={sideGameEntries} teamNameByPlayer={teamNameByPlayer} />
          </div>
        </ResultsSection>

        {/* Payout detail — per flight for multi-flight, combined otherwise */}
        <ResultsSection title="Payout Detail" subtitle="Full breakdown by category for every player">
          <div className="pt-1 space-y-3">
            {perFlightPayouts.length > 0 ? (
              perFlightPayouts.map(fp => (
                <div key={fp.flightLabel}>
                  <p className="text-sm font-bold text-foreground mb-1">{fp.flightLabel} — Final Payouts</p>
                  <PayoutTable results={fp.flightResults} holdMainPayouts={false} />
                </div>
              ))
            ) : (
              <div>
                <p className="text-sm font-bold text-foreground mb-1">
                  {finalRound?.flight_name || finalRound?.event_name || 'Tournament'} — Final Payouts
                </p>
                <PayoutTable results={results} holdMainPayouts={false} />
              </div>
            )}
          </div>
        </ResultsSection>
      </div>

      <SendResultsModal
        isOpen={sendModalOpen}
        onClose={() => setSendModalOpen(false)}
        round={{ ...finalRound, players: allTournamentPlayers }}
        results={results}
        dayLabel={null}
        flightData={{
          flights: flightResultsList.map(fr => ({
            flightNumber: fr.flightNumber,
            flightLabel: fr.flightLabel,
            gross_results: fr.results?.gross_results || [],
            net_results: fr.results?.net_results || [],
            team_gross_results: fr.results?.team_gross_results || [],
            team_net_results: fr.results?.team_net_results || [],
          })),
          playerFlightMap: playerFlightPayoutMap,
          sideGames: sideGameEntries,
        }}
      />
    </TooltipProvider>
  );
}