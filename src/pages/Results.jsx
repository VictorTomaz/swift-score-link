import React, { useEffect, useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { computeResults } from "@/lib/swiftScoreEngine";
import { computeSeriesResults, computeTeamSeriesResults } from "@/lib/seriesResults";
import { computeFlightSeriesResults, computeHybridSeriesResults } from "@/lib/flightResults";
import { useSeriesRounds, isSeriesFinalDay, isFinalFlightRound, isFinalDayRaw, isFinalDayOfFlight } from "@/hooks/useSeriesRounds";
import { computeTeamResults, applyTeamPayouts, computeTeamSkins, splitTeamSideGamePayouts, teamSideGamesActive } from "@/lib/teamScoreEngine";
import { applyTeamSideGames } from "@/lib/teamSideGames";
import { buildTeamNameByPlayer } from "@/lib/teamPlayerLookup";
import { mergeScoresIntoRound } from "@/lib/roundScores";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, Trophy, DollarSign, Calendar, CalendarDays, RefreshCw, Loader2, Edit2, Send, Layers } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
// GrossNetResults no longer wraps its own TooltipProvider — Results.jsx owns it
import InfoTooltip from "@/components/InfoTooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { motion } from "framer-motion";
import { format } from "date-fns";

import GrossNetResults from "@/components/results/GrossNetResults";
import TeamStandings from "@/components/results/TeamStandings";
import PayoutTable from "@/components/results/PayoutTable";
import SideGamesSection from "@/components/results/SideGamesSection";
import FlightStandings from "@/components/results/FlightStandings";
import FlightKpWinners from "@/components/results/FlightKpWinners";
import FieldPrizesCard from "@/components/results/FieldPrizesCard";
import FlightNavBar from "@/components/results/FlightNavBar";
import ScoreEditModal from "@/components/results/ScoreEditModal";
import SendResultsModal from "@/components/results/SendResultsModal";
import CumulativeScorecard from "@/components/scorecard/CumulativeScorecard";
import PageDescription from "@/components/PageDescription";
import FinalizeWarningDialog, { findUnscoredRounds } from "@/components/results/FinalizeWarningDialog";

export default function Results() {
  const urlParams = new URLSearchParams(window.location.search);
  const roundId = urlParams.get("id");
  const navigate = useNavigate();

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  const queryClient = useQueryClient();
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const { data: round, isLoading, error: queryError, refetch: refetchRound } = useQuery({
    queryKey: ["round", roundId],
    queryFn: async () => {
      // The single get() intermittently returns empty/404 (same issue the
      // getSeriesRounds function retries around). Retry, then fall back to a
      // filter lookup before declaring the round missing.
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      let fetched = null;
      for (let attempt = 1; attempt <= 3 && !fetched; attempt++) {
        try { fetched = await base44.entities.Round.get(roundId); } catch (e) { /* retry */ }
        if (!fetched) await sleep(200 * attempt);
      }
      if (!fetched) {
        const viaFilter = await base44.entities.Round.filter({ id: roundId });
        fetched = viaFilter?.[0] || null;
      }
      if (!fetched) throw new Error("Round could not be loaded. Please try again.");
      return fetched;
    },
    enabled: !!roundId,
    retry: 2,
    retryDelay: 400,
  });

  const [recomputeError, setRecomputeError] = useState(null);

  // Multi-day series: the main (gross/net) purse is held until the final round.
  // The parent (Day 1) is never the final round; a child is final only if it is
  // the latest-dated child in the series. Side games settle day-by-day regardless.
  const seriesRoundsQuery = useSeriesRounds(round);

  // Force a fresh fetch of series rounds on mount — the cached data may be
  // stale if flights were added after the initial query was cached (the
  // 5-minute staleTime would otherwise serve only the previously-known rounds).
  React.useEffect(() => {
    if (round && (round.is_multi_day || round.is_multi_flight)) {
      queryClient.invalidateQueries({ queryKey: ["series-rounds"] });
    }
  }, [round?.id]);

  const isFinalDay = isSeriesFinalDay(round, seriesRoundsQuery.data);
  // Also check round.is_final_flight directly so the toggle reflects the
  // optimistic cache update immediately, before the series-rounds refetch.
  const isFinalFlight = round?.is_final_flight === true || isFinalFlightRound(round, seriesRoundsQuery.data);
  // True if any round in the series already has is_final_flight set — there can
  // only be one final flight, so once any flight is marked, the toggle hides everywhere.
  const isFinalDayFlag = isFinalDayRaw(round, seriesRoundsQuery.data);
  const isMultiDay = !!(round?.is_multi_day || round?.is_multi_flight);
  const isMultiFlight = isMultiDay && (round?.is_multi_flight || round?.series_type === 'multi_flight');
  const isHybrid = !!(round?.is_multi_day && round?.is_multi_flight);
  // Hybrid tournaments: a flight having all its days entered is NOT the end of
  // the tournament, so its gross/net payouts stay held until the organizer marks
  // the tournament complete (the final-day switch) on the last flight to finish.
  // Explicitly marked complete by the organizer (the final-day switch on any flight)
  const tournamentFinalized = round?.is_series_final === true ||
    (seriesRoundsQuery.data || []).some(r => r?.is_series_final === true);
  // Raw = this round is the last day entered for its flight (drives the
  // cumulative standings computation, so multi-day flights show running totals).
  const finalDayOfFlightRaw = isFinalDayOfFlight(round, seriesRoundsQuery.data);
  // Gated = also treat it as payable. Hybrid flights hold their money until the
  // organizer marks the tournament complete.
  const finalDayOfFlight = finalDayOfFlightRaw && (!isHybrid || tournamentFinalized);
  const holdMainPayouts = isMultiDay && !isFinalDay && !finalDayOfFlight && (!isMultiFlight || isHybrid);
  // Hybrid (multi-day + multi-flight): the main purse pays on the final DAY of
  // the final flight, not just when you reach the final flight — so the toggle
  // label uses "day". Multi-flight-only tournaments are single-day, so "flight"
  // is correct there. Multi-day-only uses "day".
  const seriesLabel = (isMultiFlight && !isHybrid) ? 'Flight' : 'Day';

  // flight_number → the organizer's flight name (e.g. "Senior"), falling back
  // to "Flight N" when the flight was never named. Every flight label on this
  // page goes through here so custom names show everywhere, not just in the
  // per-flight standings.
  const flightNameFor = React.useCallback((fn) => {
    const key = String(fn || 1);
    const match = (seriesRoundsQuery.data || []).find(r => String(r?.flight_number || 1) === key && r?.flight_name);
    return match?.flight_name || `Flight ${key}`;
  }, [seriesRoundsQuery.data]);

  // The final flight's round — its results hold the combined tournament
  // totals (field standings, field prizes, all_flight_standings, per-flight
  // payouts) once it's been recomputed. Shown on EVERY flight's Results page
  // so the organizer can view the final results from any flight, not just
  // the final one.
  const finalFlightRound = React.useMemo(() => {
    if (!isMultiFlight) return null;
    const all = (seriesRoundsQuery.data || []).filter(Boolean);
    return all.find(r => r.results?.is_series_cumulative) || null;
  }, [isMultiFlight, seriesRoundsQuery.data]);
  const combinedResults = finalFlightRound?.results || null;

  // For multi-flight tournaments: the latest round in each flight, so the
  // "Add Day" button can offer a choice of which flight to add a day to.
  const flightAddDayOptions = React.useMemo(() => {
    if (!isMultiFlight) return [];
    const all = (seriesRoundsQuery.data || []).filter(Boolean);
    const flightMap = {};
    all.forEach(r => {
      const fn = r.flight_number || 1;
      if (!flightMap[fn] || new Date(r.date) > new Date(flightMap[fn].date)) {
        flightMap[fn] = r;
      }
    });
    return Object.values(flightMap)
      .sort((a, b) => (a.flight_number || 1) - (b.flight_number || 1));
  }, [isMultiFlight, seriesRoundsQuery.data]);

  // Day label for multi-day series — shown on side games in text/email results
  const dayLabel = React.useMemo(() => {
    if (!isMultiDay) return null;
    const all = seriesRoundsQuery.data || [];
    if (all.length === 0) return null;
    if (isHybrid) {
      // Hybrid: label as "Flight X, Day Y" within the flight
      const fn = round?.flight_number || 1;
      const flightRounds = all.filter(r => (r.flight_number || 1) === fn)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      const idx = flightRounds.findIndex(r => r.id === round?.id);
      return idx >= 0 ? `${flightNameFor(fn)}, Day ${idx + 1}` : null;
    }
    const sorted = [...all].sort((a, b) => new Date(a.date) - new Date(b.date));
    const currentInSorted = sorted.find(r => r.id === round?.id);
    if (!currentInSorted) return null;
    if (isMultiFlight && currentInSorted.flight_number) {
      return flightNameFor(currentInSorted.flight_number);
    }
    const idx = sorted.findIndex(r => r.id === round?.id);
    return idx >= 0 ? `${seriesLabel} ${idx + 1}` : null;
  }, [isMultiDay, isHybrid, isMultiFlight, seriesRoundsQuery.data, round?.id, round?.flight_number, seriesLabel, flightNameFor]);

  // Compute sibling flights' results on the fly when their saved results are
  // missing or stale (e.g. not yet visited/computed), so every flight's side
  // games and payouts show on the Day 1 screen — not just the current flight.
  // Uses each round's inline player scores (saved by the score entry flow).
  const computedSeriesResults = React.useMemo(() => {
    if (!isMultiFlight) return {};
    const all = (seriesRoundsQuery.data || []).filter(Boolean);
    const map = {};
    all.forEach(r => {
      if (r.id === round?.id) {
        map[r.id] = round.results || r.results || {};
      } else {
        const saved = r.results;
        const usable = saved && saved.gross_results && !saved.is_series_cumulative && !saved.is_flight_cumulative;
        if (usable) {
          map[r.id] = saved;
        } else {
          try {
            const cmp = computeResults(r);
            if (cmp.success) {
              let res = cmp.results;
              if (r.game_type && r.game_type !== "individual") {
                try {
                  const teamRes = computeTeamResults({ ...r, results: res });
                  res = applyTeamPayouts(res, teamRes);
                  res.team_gross_results = teamRes.team_gross_results;
                  res.team_net_results = teamRes.team_net_results;
                  res = applyTeamSideGames(r, res);
                } catch (e) {}
              }
              map[r.id] = res;
            }
          } catch (e) {}
        }
      }
    });
    return map;
  }, [isMultiFlight, seriesRoundsQuery.data, round?.id, round?.results]);

  // Prior days' side games — shown on the final results so every day's
  // skins/KPs/deuces are visible, each labeled with its day number.
  const sideGameDays = React.useMemo(() => {
    if (!isMultiDay) return [];
    const all = (seriesRoundsQuery.data || []).filter(Boolean);
    const sorted = [...all].sort((a, b) => new Date(a.date) - new Date(b.date));
    return sorted
      .map((r) => {
        let label;
        if (isHybrid) {
          const fn = r.flight_number || 1;
          const flightRounds = sorted.filter(rr => (rr.flight_number || 1) === fn)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
          const dayIdx = flightRounds.findIndex(rr => rr.id === r.id);
          label = `${flightNameFor(fn)}, Day ${dayIdx + 1}`;
        } else {
          label = isMultiFlight && r.flight_number
            ? flightNameFor(r.flight_number)
            : `${seriesLabel} ${sorted.findIndex(rr => rr.id === r.id) + 1}`;
        }
        return { round: r, results: computedSeriesResults[r.id] || r.results || {}, dayLabel: label };
      })
      .filter(d => d.round.id !== round?.id);
  }, [isMultiDay, isHybrid, isMultiFlight, seriesRoundsQuery.data, round?.id, seriesLabel, computedSeriesResults, flightNameFor]);

  // All series days (including current) with per-day side game payouts —
  // fed to PayoutTable so it can render a per-day side game column per player.
  const payoutDays = React.useMemo(() => {
    if (!isMultiDay) return [];
    const all = (seriesRoundsQuery.data || []).filter(Boolean);
    const sorted = [...all].sort((a, b) => new Date(a.date) - new Date(b.date));
    return sorted.map((r) => {
      let label;
      if (isHybrid) {
        const fn = r.flight_number || 1;
        const flightRounds = sorted.filter(rr => (rr.flight_number || 1) === fn)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        const dayIdx = flightRounds.findIndex(rr => rr.id === r.id);
        label = `${flightNameFor(fn)}, Day ${dayIdx + 1}`;
      } else {
        label = isMultiFlight && r.flight_number
          ? flightNameFor(r.flight_number)
          : `${seriesLabel} ${sorted.findIndex(rr => rr.id === r.id) + 1}`;
      }
      // For the current round in a hybrid tournament, the saved results have
      // been transformed by computeHybridSeriesResults — payouts have SUMMED
      // side games across all days. Use the preserved _current_day_payouts
      // (per-day values stored before transformation) so the current day's
      // column shows only that day's side games, not the cumulative sum.
      const isCurrentRound = r.id === round?.id;
      const rawResults = r.results || {};
      const dayResults = (isCurrentRound && isHybrid && rawResults._current_day_payouts)
        ? { ...rawResults, payouts: rawResults._current_day_payouts }
        : rawResults;
      return {
        results: dayResults,
        dayLabel: label,
        isCurrent: isCurrentRound,
      };
    });
  }, [isMultiDay, isHybrid, isMultiFlight, seriesRoundsQuery.data, round?.id, seriesLabel, flightNameFor]);

  // All flights' per-flight results — shown on the final flight's Results page
  // so each flight's own gross/net winners are visible alongside the Field Standings.
  const flightResultsList = React.useMemo(() => {
    if (!isMultiFlight) return [];
    const all = (seriesRoundsQuery.data || []).filter(Boolean);

    // No double dipping: field prize winners are removed from their own
    // flight's per-flight standings so they don't appear as flight winners too.
    // Gross winners stay in the net display (with $0 net payout) so each
    // flight shows the full number of paid places instead of leaving gaps.
    const fieldGrossId = combinedResults?.field_gross_winner?.player_id;
    const fieldNetId = combinedResults?.field_net_winner?.player_id;
    // Identify flight gross winners (gross_payout > 0) to remove from net
    // standings — no double dipping: a gross winner can't also appear as a
    // net winner. The current flight's standings are already filtered by
    // computeFlightSeriesResults, but sibling flights' saved results are not.
    const filterFieldWinners = (res) => {
      if (!res) return res;
      // Remove field prize winners from their own flight's standings (no double
      // dipping). Gross winners STAY in the net display (with $0 net payout) so
      // every player is listed — the flight shows the full roster, not gaps.
      const gr = Array.isArray(res.gross_results)
        ? res.gross_results.filter(r => r.player_id !== fieldGrossId && r.player_id !== fieldNetId)
        : res.gross_results;
      const nr = Array.isArray(res.net_results)
        ? res.net_results.filter(r => r.player_id !== fieldNetId && r.player_id !== fieldGrossId)
        : res.net_results;
      return { ...res, gross_results: gr, net_results: nr };
    };

    // Hybrid: group by flight_number, use latest-dated round per flight
    if (isHybrid) {
      // Prefer all_flight_standings from the final round's results — it has
      // cumulative per-flight standings for ALL flights (not just the current
      // one). Sibling rounds' saved results are per-day, so they can't be used
      // for cumulative per-flight display.
      const allStandings = combinedResults?.all_flight_standings;
      if (allStandings && allStandings.length > 0) {
        // all_flight_standings already has field winners removed from their
        // own flight's per-flight standings (no double dipping). Gross winners
        // stay in the net display with $0 net payout so every player is listed.
        // Do NOT re-apply filterFieldWinners.
        // Build a flight_number → flight_name + round lookup from the series rounds
        const fnToFlightName = {};
        const fnToRound = {};
        all.forEach(r => {
          const fn = String(r.flight_number || 1);
          if (!fnToFlightName[fn] && r.flight_name) fnToFlightName[fn] = r.flight_name;
          if (!fnToRound[fn]) fnToRound[fn] = r;
        });
        return allStandings
          .sort((a, b) => (a.flightNumber || 0) - (b.flightNumber || 0))
          .map(fs => {
            // Pull team standings from the actual flight's saved results so
            // team events show team standings (not individual player scores).
            const actualRes = fnToRound[String(fs.flightNumber)]?.results || {};
            return {
              round: { id: `standings_${fs.flightNumber}`, event_name: fnToFlightName[String(fs.flightNumber)] || `Flight ${fs.flightNumber}`, course_name: round?.course_name, game_type: round?.game_type, team_mode: round?.team_mode },
              results: {
                gross_results: fs.gross_results,
                net_results: fs.net_results,
                team_gross_results: actualRes.team_gross_results,
                team_net_results: actualRes.team_net_results,
              },
              flightLabel: fnToFlightName[String(fs.flightNumber)] || `Flight ${fs.flightNumber}`,
              flightNumber: String(fs.flightNumber),
            };
          });
      }
      // Fallback: use latest-dated round per flight (per-day, not cumulative).
      // Skip rounds with no computed standings yet (e.g. a just-added day still
      // being scored) — otherwise a flight's card goes blank even though an
      // earlier day has full results.
      const hasStandings = (r) => {
        const res = r.id === round?.id ? round?.results : (computedSeriesResults[r.id] || r.results);
        return (res?.gross_results || []).length > 0 || (res?.team_gross_results || []).length > 0;
      };
      const flightMap = {};
      all.forEach(r => {
        const fn = r.flight_number || 1;
        const cur = flightMap[fn];
        if (!cur) { flightMap[fn] = r; return; }
        const rScored = hasStandings(r);
        const curScored = hasStandings(cur);
        if (rScored !== curScored) {
          if (rScored) flightMap[fn] = r;
          return;
        }
        if (new Date(r.date) > new Date(cur.date)) flightMap[fn] = r;
      });
      return Object.entries(flightMap)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([fn, r]) => {
          const rRes = r.id === round?.id ? round?.results : (computedSeriesResults[r.id] || r.results || {});
          const rawResults = {
            ...rRes,
            gross_results: rRes?.flight_own_gross || rRes?.gross_results,
            net_results: rRes?.flight_own_net || rRes?.net_results,
            team_gross_results: rRes?.team_gross_results,
            team_net_results: rRes?.team_net_results,
          };
          return {
            round: r,
            results: holdMainPayouts ? rawResults : filterFieldWinners(rawResults),
            flightLabel: r.flight_name || `Flight ${Number(fn)}`,
            flightNumber: String(fn),
          };
        });
    }

    // Non-hybrid: one round per flight. Use flight_number for the label
    // (not array index) so Flight 3 shows as "Flight 3" even if it's the
    // only round returned by the series query.
    const sorted = [...all].sort((a, b) => new Date(a.date) - new Date(b.date));
    return sorted.map((r) => {
      const rRes = r.id === round?.id ? round?.results : (computedSeriesResults[r.id] || r.results || {});
      return {
        round: r,
        results: filterFieldWinners({
          ...rRes,
          gross_results: rRes?.flight_own_gross || rRes?.gross_results,
          net_results: rRes?.flight_own_net || rRes?.net_results,
        }),
        flightLabel: r.flight_name || `Flight ${r.flight_number || sorted.indexOf(r) + 1}`,
        flightNumber: String(r.flight_number || sorted.indexOf(r) + 1),
      };
    });
  }, [isMultiFlight, isHybrid, seriesRoundsQuery.data, round?.id, round?.results, seriesLabel, holdMainPayouts, computedSeriesResults]);

  // Player → flight-number map, built from per-flight standings. Used to split
  // the combined payouts array into per-flight payout tables on the final page.
  // Field prize winners are removed from their own flight's per-flight standings
  // (no double dipping), so they won't be found in flightResultsList — also scan
  // the combined field standings (gross_results/net_results) which include ALL
  // players with a 'flight' label, so field winners are mapped to their flight.
  const playerFlightPayoutMap = React.useMemo(() => {
    if (!isMultiFlight) return {};
    // Prefer the pre-built player_flight_map from computeHybridSeriesResults —
    // it's complete (includes field prize winners who were removed from their
    // flight's per-flight standings) and doesn't rely on the 'flight' field
    // matching a regex.
    if (combinedResults?.player_flight_map) return combinedResults.player_flight_map;
    const map = {};
    flightResultsList.forEach(fr => {
      const fn = String(fr.flightNumber || fr.round?.flight_number || 1);
      [...(fr.results?.gross_results || []), ...(fr.results?.net_results || [])].forEach(r => {
        if (r.player_id && !map[r.player_id]) map[r.player_id] = fn;
      });
    });
    // Field winners are missing from per-flight standings — find their flight
    // from the combined field standings, which have a 'flight' label like
    // "Flight 2" or "Flight 2 Day 1".
    const fieldStandings = [...(combinedResults?.gross_results || []), ...(combinedResults?.net_results || [])];
    fieldStandings.forEach(r => {
      if (r.player_id && !map[r.player_id] && r.flight) {
        const m = String(r.flight).match(/Flight\s*(\d+)/i);
        if (m) map[r.player_id] = m[1];
      }
    });
    return map;
  }, [isMultiFlight, flightResultsList, round?.results]);

  // Per-flight payout data — each flight gets its own payouts slice + its own
  // side-game day columns (hybrid only), so the final page shows a separate
  // Final Payouts table per flight instead of one combined table.
  // Uses round?.results (not the post-return `results` const) so the hook
  // runs before the early returns, satisfying rules-of-hooks.
  const perFlightPayouts = React.useMemo(() => {
    if (!isMultiFlight || !combinedResults || holdMainPayouts || !flightResultsList.length) return [];
    const res = combinedResults;
    return flightResultsList.map(fr => {
      const fn = String(fr.flightNumber || fr.round?.flight_number || 1);
      let slice = (res.payouts || [])
        .filter(p => playerFlightPayoutMap[p.player_id] === fn);
      // Before the tournament is finalized, the current round's payouts array
      // only holds THIS flight's players — every other flight's slice comes out
      // empty. Fall back to that flight's own saved per-flight payouts so each
      // flight still shows its own gross/net/side-game payout table.
      if (slice.length === 0) {
        slice = fr.results?.payouts || [];
      }
      const flightPayouts = slice
        .map(p => {
          if (!isHybrid) return p;
          // Hybrid only: strip side games from total_payout — they're provided
          // by the per-day columns (flightPayoutDays). grandTotal adds per-day
          // side games to total_payout, so leaving them in would double-count.
          return {
            ...p,
            total_payout: (p.gross_payout || 0) + (p.net_payout || 0) +
              (p.field_gross_payout || 0) + (p.field_net_payout || 0),
          };
        });
      // Hybrid: per-day side game columns for this flight. payoutDays already
      // uses _current_day_payouts for the current day (per-day, not summed),
      // so columns show correct per-day values.
      // Set isCurrent=false for ALL days: since we stripped ALL side games from
      // total_payout (not just prior days'), grandTotal must sum every day's
      // side games — including the current one — to get the correct total.
      const flightPayoutDays = isHybrid
        ? payoutDays
            .filter(d => d.dayLabel?.startsWith(`${flightNameFor(fn)},`))
            .map(d => ({ ...d, dayLabel: d.dayLabel.replace(`${flightNameFor(fn)}, `, ''), isCurrent: false }))
        : [];
      return {
        flightLabel: fr.flightLabel,
        flightResults: { ...res, payouts: flightPayouts },
        flightPayoutDays,
      };
    });
  }, [isMultiFlight, combinedResults, holdMainPayouts, flightResultsList, playerFlightPayoutMap, isHybrid, payoutDays, flightNameFor]);

  // While payouts are held, the main standings block below already shows THIS
  // flight's own gross/net — so repeating it as a Per-Flight card is redundant.
  // Once finalized, the main block shows combined Field Standings, so every
  // flight's own card (including this one) is meaningful again.
  // The grouped per-flight list is the primary display for multi-flight
  // tournaments — every flight (including the current one) is shown there so
  // the organizer can see all flights side by side as they come in.
  const isRedundantFlightCard = () => false;
  // With the group list showing this flight too, the single-round standings
  // block below would just repeat it while payouts are held — hide it there.
  const hideMainStandings = isMultiFlight && holdMainPayouts && flightResultsList.length > 0;

  // Flight number → display label (event name) for grouping tournament-wide
  // KP winners by flight (hybrid only).
  const flightLabels = React.useMemo(() => {
    if (!isMultiFlight) return {};
    const map = {};
    (seriesRoundsQuery.data || []).forEach(r => {
      const fn = String(r.flight_number || 1);
      if (!map[fn]) map[fn] = r.flight_name || `Flight ${fn}`;
    });
    return map;
  }, [isMultiFlight, seriesRoundsQuery.data]);

  // "flight-date" → "Flight Name · Day N" label for grouping KP winners by
  // flight+day. Matches the key format used by SideGamesSection.
  const flightDayLabels = React.useMemo(() => {
    if (!isMultiFlight) return {};
    const map = {};
    const all = (seriesRoundsQuery.data || []).filter(Boolean);
    all.forEach(r => {
      const fn = String(r.flight_number || 1);
      const flightRounds = all
        .filter(rr => String(rr.flight_number || 1) === fn)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      const dayIdx = flightRounds.findIndex(rr => rr.id === r.id);
      map[`${fn}-${r.date}`] = `${flightLabels[fn] || `Flight ${fn}`} · Day ${dayIdx + 1}`;
    });
    return map;
  }, [isMultiFlight, seriesRoundsQuery.data, flightLabels]);

  // Multi-flight: KP is a tournament-wide contest, so this day's KP card must
  // show EVERY flight's winners for the same date — not just this flight's.
  // Pool the same-date KP pots and divide equally among all same-date winners
  // so each entry shows the same payout, and tag each winner with its flight
  // + date so SideGamesSection groups them by flight.
  // KP pots settle per-day, so each DATE is pooled across that date's flights
  // and divided among that date's winners. Every day in the series is included
  // (not just today's), so earlier days' KP winners stay visible instead of
  // disappearing until the tournament is finalized.
  // A date's KP pot is pooled across every flight that plays that date, so the
  // per-winner amount isn't final until all those flights have reported in.
  // Hold KP winners for any date that still has an incomplete round.
  const completeKpDates = React.useMemo(() => {
    if (!isMultiFlight) return null;
    const all = (seriesRoundsQuery.data || []).filter(Boolean);
    if (all.length === 0) return null;
    const byDate = {};
    all.forEach(r => {
      const d = r.date || '';
      if (!d) return;
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(r);
    });
    const set = new Set();
    Object.entries(byDate).forEach(([d, rounds]) => {
      if (rounds.every(r => r.status === 'completed')) set.add(d);
    });
    return set;
  }, [isMultiFlight, seriesRoundsQuery.data]);

  const sameDayKp = React.useMemo(() => {
    if (!isMultiFlight) return null;
    const all = (seriesRoundsQuery.data || []).filter(Boolean);
    if (all.length === 0) return null;
    const nameMap = {};
    const flightMap = {};
    const byDate = {};
    all.forEach(r => {
      (r.players || []).forEach(p => {
        if (p.player_id && p.name) nameMap[p.player_id] = p.name;
        if (p.player_id) flightMap[p.player_id] = String(r.flight_number || 1);
      });
      const d = r.date || '';
      if (!byDate[d]) byDate[d] = { pot: 0, winners: [] };
      byDate[d].pot += (r.kps_enabled && r.kp_separate_buy_in)
        ? (r.kp_player_ids?.length || r.players?.length || 0) * (r.kp_buy_in || 0)
        : 0;
      (r.kp_winners || []).forEach(kp => {
        if (kp?.player_id) byDate[d].winners.push({ ...kp, flight: Number(r.flight_number || 1), date: r.date });
      });
    });
    const winners = [];
    let totalPot = 0;
    Object.entries(byDate).forEach(([d, { pot, winners: dayWinners }]) => {
      // Hold KP for dates that still have an incomplete flight — the per-winner
      // amount changes as more flights report in.
      if (completeKpDates && !completeKpDates.has(d)) return;
      totalPot += pot;
      const amount = dayWinners.length > 0 ? pot / dayWinners.length : 0;
      dayWinners.forEach(kp => winners.push({
        ...kp,
        amount,
        name: nameMap[kp.player_id] || kp.name || kp.player_id,
      }));
    });
    if (winners.length === 0) return null;
    return {
      flightMap,
      results: {
        kp_results: winners,
        kp_separate_pot: totalPot,
        kp_per_entry_amount: winners.length > 0 ? totalPot / winners.length : 0,
      },
    };
  }, [isMultiFlight, seriesRoundsQuery.data, completeKpDates]);

  // Build per-flight-day side-game entries for the Send Results text/email.
  // The flat blocks in formatResultsText only read the current round's
  // results, so a multi-flight/multi-day tournament would otherwise only show
  // the current day's skins/deuces/KPs — every other day's side games would be
  // missing from the message. This gathers each round's own side games so the
  // full tournament's side games are included.
  const sideGamesEntries = React.useMemo(() => {
    if (!isMultiDay) return [];
    const all = (seriesRoundsQuery.data || []).filter(Boolean);
    if (all.length === 0) return [];
    const sorted = [...all].sort((a, b) => new Date(a.date) - new Date(b.date));
    const entries = sorted.map(r => {
      let label;
      if (isHybrid) {
        const fn = r.flight_number || 1;
        const flightRounds = sorted.filter(rr => (rr.flight_number || 1) === fn)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        const dayIdx = flightRounds.findIndex(rr => rr.id === r.id);
        label = `${flightNameFor(fn)}, Day ${dayIdx + 1}`;
      } else if (isMultiFlight) {
        label = flightNameFor(r.flight_number || 1);
      } else {
        label = `${seriesLabel} ${sorted.findIndex(rr => rr.id === r.id) + 1}`;
      }
      return {
        label,
        round: r,
        results: r.results || {},
        // Multi-flight KP is pooled tournament-wide (shown in a dedicated
        // entry below), so suppress it in the per-flight-day entries.
        suppressKP: isMultiFlight,
      };
    });
    // Multi-flight: append a single pooled KP entry covering all flights/days.
    if (isMultiFlight && sameDayKp) {
      entries.push({
        label: 'KP Winners (All Flights)',
        round,
        results: sameDayKp.results,
        suppressKP: false,
        playerFlightMap: sameDayKp.flightMap,
        flightLabels,
        flightDayLabels,
      });
    }
    return entries;
  }, [isMultiDay, isHybrid, isMultiFlight, seriesRoundsQuery.data, seriesLabel, sameDayKp, round, flightLabels, flightDayLabels, flightNameFor]);

  // Multi-flight combined results don't carry added_money (it lives on the
  // parent) or a total deuce_pot (it settles per-day). Fall back to the parent
  // round's added_money and the sum of each day's deuce_pot so the pot
  // breakdown shows these line items on the final flight's Results page.
  const totalDeucePot = React.useMemo(() => {
    return (seriesRoundsQuery.data || []).reduce((sum, r) => sum + (r?.results?.deuce_pot || 0), 0);
  }, [seriesRoundsQuery.data]);

  // Multi-flight: every unique player across all flights/days, so Send Results
  // isn't limited to just this flight's roster.
  const allTournamentPlayers = React.useMemo(() => {
    if (!isMultiFlight) return null;
    const byKey = new Map();
    (seriesRoundsQuery.data || []).forEach(r => {
      (r.players || []).forEach(p => {
        const key = p.player_id || p.name;
        if (key && !byKey.has(key)) byKey.set(key, p);
      });
    });
    return Array.from(byKey.values());
  }, [isMultiFlight, seriesRoundsQuery.data]);
  const parentAddedMoney = React.useMemo(() => {
    const all = (seriesRoundsQuery.data || []).filter(Boolean);
    const parentId = round?.parent_round_id || round?.id;
    const parent = all.find(r => r.id === parentId);
    return { added_money: parent?.added_money || 0, label: parent?.added_money_label || '' };
  }, [seriesRoundsQuery.data, round?.id, round?.parent_round_id]);

  // Determine if we need to compute results. A round may have stale/partial saved
  // results (e.g. individual gross/net but no team standings, or per-day but no
  // series-cumulative totals) from an earlier compute — auto-recompute then too,
  // so the standings/scorecard don't render empty. After the fixup save, the
  // missing fields exist and subsequent loads skip the recompute.
  const isTeamRound = !!(round?.game_type && round.game_type !== "individual");
  const seriesLoaded = !isMultiDay || !!seriesRoundsQuery.data;
  const needsComputation = round && (
    !round.results ||
    round.results?.total_pot == null ||
    (isTeamRound && !(round.results?.team_gross_results?.length > 0) && !(round.results?.team_vegas_results?.length > 0)) ||
    // Multi-day series: a non-final day must never hold cumulative results, and
    // the final day must have them. Recompute when stale — e.g. a day that was
    // final when it computed (and saved is_series_cumulative) but is no longer
    // the latest day after a later round was added.
    (isMultiDay && seriesLoaded && !!round.results?.is_series_cumulative !== isFinalDay) ||
    // Multi-day final round: also recompute when a sibling day has no saved
    // results (e.g. cleared by the stale-cumulative self-heal) so its per-day
    // scores get recomputed and persisted for the scorecard/PDF.
    (isMultiDay && isFinalDay && seriesLoaded && (seriesRoundsQuery.data || []).some(s => s.id !== round?.id && !s.results)) ||
    // Final day of a non-final flight: compute this flight's per-flight payouts
    // so they're visible. Also recompute when stale (is_flight_final set but
    // this is no longer the final day, e.g. a new day was added to the flight).
    (isMultiDay && seriesLoaded && finalDayOfFlightRaw && !round.results?.is_flight_final) ||
    (isMultiDay && seriesLoaded && !finalDayOfFlightRaw && round.results?.is_flight_final) ||
    // Team flight whose cumulative pass ran through the individual engine:
    // team standings exist but no team was paid — recompute with the team engine.
    (isTeamRound && isMultiDay && seriesLoaded && finalDayOfFlightRaw && round.results?.is_flight_final &&
      (round.results?.team_gross_results || []).length > 0 &&
      (round.results?.team_gross_results || []).every(t => !(t.gross_payout > 0))) ||
    // Stale field prize data: field prizes disabled but winners still stored
    (isMultiFlight && round?.field_prizes_enabled === false && (round.results?.field_gross_winner || round.results?.field_net_winner)) ||
    // Multi-flight: recompute when the combined payouts are missing side game
    // (skins, deuces) data that exists in the per-flight/per-day results — the
    // pre-fix computation didn't carry skins/deuces into the combined payouts.
    (isMultiFlight && seriesLoaded && round?.results?.is_series_cumulative &&
      (seriesRoundsQuery.data || []).some(s =>
        (s.results?.payouts || []).some(p => (p.gross_skins_payout || 0) > 0 || (p.deuce_payout || 0) > 0)
      ) &&
      (round?.results?.payouts || []).every(p => (p.gross_skins_payout || 0) === 0 && (p.deuce_payout || 0) === 0)
    )
  );

  const recomputeMutation = useMutation({
    mutationFn: async ({ silent = false } = {}) => {
      console.log('[Results] Starting recompute for round:', roundId);
      
      let freshRound = await base44.entities.Round.get(roundId);
      console.log('[Results] Fresh round:', freshRound);
      if (!freshRound) {
        throw new Error('Round not found');
      }

      // Load scores from RoundScore entity
      let roundScoreMap = {};
      try {
        const { loadRoundScores } = await import("@/lib/roundScores");
        roundScoreMap = await loadRoundScores(roundId);
        console.log('[Results] Round scores:', roundScoreMap);
      } catch (e) {
        console.log('[Results] No RoundScore data, using inline scores');
      }
      
      const mergedPlayers = (freshRound.players || []).map(p => {
        const rsScores = roundScoreMap[p.player_id];
        const scores = (rsScores && rsScores.length > 0) ? rsScores : (p.scores || []);
        return { ...p, scores };
      });
      freshRound = { ...freshRound, players: mergedPlayers };

      console.log('[Results] Computing with players:', freshRound.players.map(p => ({ name: p.name, scoresCount: p.scores?.length })));
      
      const result = computeResults(freshRound);
      console.log('[Results] Compute result:', result);
      console.log('[Results] Payouts:', JSON.stringify(result.results?.payouts?.map(p => ({ name: p.name, gross: p.gross_payout, net: p.net_payout, total: p.total_payout }))));
      
      if (!result.success) {
        console.error('[Results] Compute failed:', result.issues);
        throw new Error(result.issues.join(", "));
      }

      // Strip bulky recomputable arrays (achievements, net_scores) before saving to avoid
      // exceeding DB size limits on large fields. No display component uses these — they're
      // derived from scores + par + handicap, which are already stored on the round.
      let slimResults = {
        ...result.results,
        gross_results: (result.results.gross_results || []).map(({ achievements, ...r }) => r),
        net_results: (result.results.net_results || []).map(({ achievements, net_scores, ...r }) => r),
      };

      // Team mode: compute team best-ball standings and override gross/net payouts
      if (freshRound.game_type && freshRound.game_type !== "individual") {
        const teamResult = computeTeamResults({ ...freshRound, results: slimResults });
        slimResults = applyTeamPayouts(slimResults, teamResult);
        slimResults.team_gross_results = teamResult.team_gross_results;
        slimResults.team_net_results = teamResult.team_net_results;

        // Team skins: recompute skins at the team level (best-ball per hole,
        // won by the team) and split each team's winnings equally among members.
        // Only override a skins category the organizer actually enabled, so we
        // don't surface a Net Skins table they never set up. Skip when KPs are
        // folded into the skins pot — that pot is shared with individual KP
        // winners and re-dividing it here would mispay them.
        const kpFolded = freshRound.kps_enabled && !freshRound.kp_separate_buy_in &&
          (freshRound.gross_skins_enabled || freshRound.net_skins_enabled);
        const wantsGrossSkins = !!freshRound.gross_skins_enabled;
        const wantsNetSkins = !!freshRound.net_skins_enabled;
        // In a team event, skins default to team-level (team best-ball per hole,
        // split among members). The organizer can opt out via the "Team Skins"
        // toggle in setup, which sets skins_team_mode=false for individual skins.
        // Aggregate is excluded — "team skins" (lowest team SUM per hole) isn't a
        // valid game, so skins stay individual there even if the flag is set.
        // Aggregate and Las Vegas keep side games individual.
        const skinsTeamMode = teamSideGamesActive(freshRound);
        if (!kpFolded && skinsTeamMode && (wantsGrossSkins || wantsNetSkins)) {
          const teamSkins = computeTeamSkins(
            { ...freshRound, results: slimResults },
            wantsGrossSkins ? (slimResults.gross_skins_allocated_pot || slimResults.gross_skins_separate_pot || 0) : 0,
            wantsNetSkins ? (slimResults.net_skins_allocated_pot || slimResults.net_skins_separate_pot || 0) : 0
          );
          if (wantsGrossSkins) slimResults.gross_skins = teamSkins.gross_skins;
          if (wantsNetSkins) slimResults.net_skins = teamSkins.net_skins;
          slimResults.payouts = (slimResults.payouts || []).map((p) => {
          const gsp = wantsGrossSkins ? (teamSkins.grossSkinsPlayerPayouts[p.player_id] || 0) : (p.gross_skins_payout || 0);
          const nsp = wantsNetSkins ? (teamSkins.netSkinsPlayerPayouts[p.player_id] || 0) : (p.net_skins_payout || 0);
          return {
            ...p,
            gross_skins_payout: gsp,
            net_skins_payout: nsp,
            total_payout: (p.gross_payout || 0) + (p.net_payout || 0) + (p.kp_payout || 0) + gsp + nsp + (p.deuce_payout || 0),
          };
          });
          }

          // Team side games: split KP and Deuce pot winnings equally among team
          // members (same as team skins). A KP/deuce won by one player is shared
          // with their teammate. Skip when KPs are folded into the skins pot —
          // that pot is already handled individually above.
          if (skinsTeamMode && !kpFolded) {
          slimResults.payouts = splitTeamSideGamePayouts(
          { ...freshRound, results: slimResults },
          slimResults.payouts
          );
          }
          }

      // Multi-day / multi-flight series: on the final round, replace per-day
      // gross/net with cumulative or field standings across the whole series
      // (the main purse pays here). Both flags are checked because multi-flight-
      // only tournaments don't set is_multi_day (the toggles are independent).
      if (freshRound.is_multi_day || freshRound.is_multi_flight) {
        const anchorId = freshRound.parent_round_id || freshRound.id;
        // Fetch the full series via the getSeriesRounds backend function, which
        // uses the service role. The user-context children filter intermittently
        // returns empty and would corrupt the cumulative totals (computeSeries
        // runs with no siblings and overwrites the good standings). Fall back
        // to the user-context filter only if the function is unreachable.
        let allSeries = [freshRound];
        let _debugSeriesFnOk = false;
        try {
          const sres = await base44.functions.invoke("getSeriesRounds", { roundId: roundId });
          const sdata = sres?.data || sres;
          if (sdata?.rounds && sdata.rounds.length > 0) { allSeries = sdata.rounds; _debugSeriesFnOk = true; }
        } catch (serErr) { /* handled by fallback below */ }
        // Fallback: if the function returned only the current round, OR if
        // the anchor (parent / Day 1) round is missing from the result (the
        // service-role get for the parent intermittently fails, causing the
        // function to replace it with the current round), fetch the parent
        // and siblings directly via user context so the series computation
        // has ALL days to aggregate.
        // Use .get() for the parent — filter({ id }) does not work for the
        // built-in id field, which silently dropped Day 1 from the totals.
        const hasAnchor = allSeries.some(r => r.id === anchorId);
        if (allSeries.length <= 1 || (!hasAnchor && freshRound.id !== anchorId)) {
          const seriesChildren = await base44.entities.Round.filter({ parent_round_id: anchorId });
          let parentRound = freshRound;
          if (freshRound.id !== anchorId) {
            try { parentRound = await base44.entities.Round.get(anchorId); }
            catch (e) { /* keep freshRound as fallback */ }
          }
          const seen = new Set();
          const fallbackSeries = [parentRound, ...(seriesChildren || [])]
            .filter(Boolean)
            .filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)));
          if (fallbackSeries.length > allSeries.length || (!hasAnchor && parentRound?.id === anchorId)) {
            allSeries = fallbackSeries;
            _debugSeriesFnOk = false;
          }
        }
        const parentRound = allSeries.find(r => r.id === anchorId) || allSeries.find(r => !r.parent_round_id) || freshRound;
        if (isSeriesFinalDay(freshRound, allSeries)) {
          const siblingRounds = allSeries.filter(r => r.id !== freshRound.id);
          const isTeamSeries = !!(freshRound.game_type && freshRound.game_type !== "individual");
          const siblingResults = [];
          const siblingPairs = [];
          const siblingPersistPromises = [];
          // Load every sibling's scores in parallel — doing this serially inside
          // the loop made finalize take one round trip per day/flight.
          const { loadRoundScores } = await import("@/lib/roundScores");
          const sibScoreMaps = {};
          await Promise.all(siblingRounds.map(async (sib) => {
            try { sibScoreMaps[sib.id] = await loadRoundScores(sib.id); }
            catch (e) { sibScoreMaps[sib.id] = {}; }
          }));
          for (const sib of siblingRounds) {
            // Always build a merged-scores copy of the sibling so team results can
            // be computed even when the saved results lack team standings.
            const sibScoreMap = sibScoreMaps[sib.id] || {};
            const sibMergedPlayers = (sib.players || []).map(p => {
              const rs = sibScoreMap[p.player_id];
              const scores = (rs && rs.length > 0) ? rs : (p.scores || []);
              return { ...p, scores };
            });
            const sibRound = { ...sib, players: sibMergedPlayers, all_players: sib.players };

            let sibRes = sib.results;
            let sibRecomputed = false;
            // A prior day whose saved results are missing (cleared) or are
            // themselves series-cumulative would double-count if aggregated
            // as-is. Also catch siblings whose gross_results contain more
            // players than the round has (field-wide data from a previous
            // final-flight compute where is_series_cumulative was later
            // deleted). Recompute fresh per-day results from that day's scores
            // so only that day contributes to the series totals.
            const sibPlayerCount = (sib.players || sib.all_players || []).length;
            const sibResultCount = (sibRes?.gross_results || []).length;
            const hasFieldWideData = sibPlayerCount > 0 && sibResultCount > sibPlayerCount;
            if (!sibRes || !sibRes.gross_results || sibRes.is_series_cumulative || sibRes.is_flight_cumulative || sibRes.is_flight_final || hasFieldWideData) {
              try {
                const sibCompute = computeResults(sibRound);
                if (sibCompute.success) { sibRes = sibCompute.results; sibRecomputed = true; }
              } catch (e) {
                console.log('[Results] Series sibling compute failed:', e.message);
              }
            }
            if (sibRes && sibRes.gross_results) {
              // Team series: ensure sibling has team standings AND team-level
              // side games. Saved skins rows from an individual computation
              // carry no team_id — those need the team pass too, otherwise the
              // first finalize leaves side games individual.
              const sibSkinsAreIndividual = [
                ...(sibRes.gross_skins || []),
                ...(sibRes.net_skins || []),
              ].some(s => !s.team_id && !s.team_name);
              if (isTeamSeries && (!sibRes.team_gross_results || sibRecomputed || sibSkinsAreIndividual)) {
                try {
                  const sibTeam = computeTeamResults({ ...sibRound, results: sibRes });
                  sibRes = applyTeamPayouts(sibRes, sibTeam);
                  sibRes.team_gross_results = sibTeam.team_gross_results;
                  sibRes.team_net_results = sibTeam.team_net_results;
                  sibRes = applyTeamSideGames(sibRound, sibRes);
                  sibRecomputed = true;
                } catch (e) {
                  console.log('[Results] Series sibling team compute failed:', e.message);
                }
              }
              // Persist freshly recomputed per-day results back to the sibling
              // round so the CumulativeScorecard (and PDF) can read every day's
              // scores — not just the days that still have saved results. The
              // saved results are per-day (no is_series_cumulative) so they never
              // double-count on a later final-round recompute.
              if (sibRecomputed) {
                const sibSlim = {
                  ...sibRes,
                  gross_results: (sibRes.gross_results || []).map(({ achievements, ...r }) => r),
                  net_results: (sibRes.net_results || []).map(({ achievements, net_scores, ...r }) => r),
                };
                delete sibSlim.is_series_cumulative;
                siblingPersistPromises.push(
                  base44.entities.Round.update(sib.id, { results: sibSlim })
                    .catch(e => console.log('[Results] Sibling persist failed:', e.message))
                );
              }
              siblingResults.push(sibRes);
              siblingPairs.push({ round: sib, results: sibRes });
            }
          }
          // Wait for every sibling's per-day results to be saved before we save
          // the final round, so the scorecard refetch (invalidate on success)
          // sees all days populated at once.
          if (siblingPersistPromises.length > 0) {
            await Promise.all(siblingPersistPromises);
          }
          slimResults._debug_series = {
            seriesFnOk: _debugSeriesFnOk,
            allSeriesCount: allSeries.length,
            allSeriesIds: allSeries.map(r => r.id),
            isFinalDay: isSeriesFinalDay(freshRound, allSeries),
            siblingRoundsCount: allSeries.filter(r => r.id !== freshRound.id).length,
            siblingResultsCount: siblingResults.length,
            siblingPairsCount: siblingPairs.length,
            isMultiFlight: freshRound.is_multi_flight,
            isMultiDay: freshRound.is_multi_day,
            isHybrid,
            seriesType: freshRound.series_type,
            branchEntered: siblingResults.length > 0,
          };
          if (siblingResults.length > 0) {
            if (isHybrid || (freshRound.is_multi_day && freshRound.is_multi_flight)) {
              slimResults = computeHybridSeriesResults(freshRound, slimResults, siblingPairs, parentRound);
              console.log('[Results] Applied hybrid series results across', siblingPairs.length + 1, 'rounds');
            } else if (freshRound.is_multi_flight || freshRound.series_type === 'multi_flight') {
              slimResults = computeFlightSeriesResults(freshRound, slimResults, siblingPairs, parentRound);
              console.log('[Results] Applied flight field standings across', siblingPairs.length + 1, 'flights');
            } else if (isTeamSeries) {
              slimResults = computeTeamSeriesResults(freshRound, slimResults, siblingResults, parentRound);
              console.log('[Results] Applied team series cumulative results across', siblingResults.length + 1, 'days');
            } else {
              slimResults = computeSeriesResults(freshRound, slimResults, siblingResults, parentRound);
              console.log('[Results] Applied series cumulative results across', siblingResults.length + 1, 'days');
            }
          }
        } else if (freshRound.is_multi_flight && isFinalDayOfFlight(freshRound, allSeries)) {
          // Final day of a non-final flight: compute this flight's standalone
          // series results so the flight's gross/net payouts are visible on
          // this round's Results page. Field standings (across all flights)
          // are still held until the final flight's final day.
          const fn = freshRound.flight_number || 1;
          const flightSiblings = allSeries.filter(r =>
            r.id !== freshRound.id && (r.flight_number || 1) === fn
          );
          const flightSiblingResults = [];
          for (const sib of flightSiblings) {
            let sibRes = sib.results;
            const sibPlayerCount = (sib.players || sib.all_players || []).length;
            const sibResultCount = (sibRes?.gross_results || []).length;
            const hasFieldWideData = sibPlayerCount > 0 && sibResultCount > sibPlayerCount;
            if (!sibRes || !sibRes.gross_results || sibRes.is_series_cumulative || sibRes.is_flight_cumulative || sibRes.is_flight_final || hasFieldWideData) {
              try {
                let sibScoreMap = {};
                try {
                  const { loadRoundScores } = await import("@/lib/roundScores");
                  sibScoreMap = await loadRoundScores(sib.id);
                } catch (e) {}
                const sibMergedPlayers = (sib.players || []).map(p => {
                  const rs = sibScoreMap[p.player_id];
                  const scores = (rs && rs.length > 0) ? rs : (p.scores || []);
                  return { ...p, scores };
                });
                const sibRound = { ...sib, players: sibMergedPlayers, all_players: sib.players };
                const sibCompute = computeResults(sibRound);
                if (sibCompute.success) {
                  sibRes = sibCompute.results;
                  if (sibRound.game_type && sibRound.game_type !== "individual") {
                    const sibTeam = computeTeamResults({ ...sibRound, results: sibRes });
                    sibRes = applyTeamPayouts(sibRes, sibTeam);
                    sibRes.team_gross_results = sibTeam.team_gross_results;
                    sibRes.team_net_results = sibTeam.team_net_results;
                    sibRes = applyTeamSideGames(sibRound, sibRes);
                  }
                }
              } catch (e) {
                console.log('[Results] Flight sibling compute failed:', e.message);
              }
            }
            if (sibRes && sibRes.gross_results) flightSiblingResults.push(sibRes);
          }
          if (flightSiblingResults.length > 0) {
            // Team events must use the TEAM cumulative function — the individual
            // one leaves team standings at per-day scores with $0 team payouts,
            // so the flight looks like nothing was recorded.
            const isTeamFlight = !!(freshRound.game_type && freshRound.game_type !== "individual");
            slimResults = isTeamFlight
              ? computeTeamSeriesResults(freshRound, slimResults, flightSiblingResults, parentRound)
              : computeSeriesResults(freshRound, slimResults, flightSiblingResults, parentRound);
            slimResults.is_flight_final = true;
            delete slimResults.is_series_cumulative;
          }
        }
      }

      // Only clear the cached results PDF on explicit recompute / score edits.
      // The silent auto-recompute fires on page load when results look incomplete
      // (e.g. is_series_cumulative missing) — if it clears the cache, leaving and
      // returning to the app wipes the good PDF and the next print regenerates
      // one that may miss the scorecard due to the series data fetch race.
      slimResults._debug_entry = {
        is_multi_day: freshRound.is_multi_day,
        is_multi_flight: freshRound.is_multi_flight,
        series_type: freshRound.series_type,
        parent_round_id: freshRound.parent_round_id,
        is_series_final: freshRound.is_series_final,
        hasSeriesDebug: !!slimResults._debug_series,
      };
      const updatePayload = { results: slimResults, players: mergedPlayers };
      if (!silent) updatePayload.results_pdf_url = null;
      await base44.entities.Round.update(roundId, updatePayload);
      console.log('[Results] Results + players saved successfully');

      return { players: mergedPlayers, results: slimResults };
    },
    onSuccess: ({ players, results }, vars) => {
      console.log('[Results] Mutation success');
      queryClient.setQueryData(["round", roundId], (old) => old ? { ...old, players, results } : old);
      // The CumulativeScorecard reads series rounds from its own cached query.
      // Invalidate it so the scorecard refetches the freshly-saved results
      // instead of rendering the stale pre-recompute copy.
      queryClient.invalidateQueries({ queryKey: ["series-rounds"] });
      setRecomputeError(null);
      if (!vars?.silent) toast.success("Results computed successfully");
    },
    onError: (e) => {
      console.error('[Results] Mutation error:', e);
      setRecomputeError(e.message || 'Unknown error');
      toast.error("Failed to compute results: " + (e.message || 'Unknown error'), { duration: 8000 });
    },
  });

  // Auto-recompute on load ONLY when results are missing. Running it on every
  // load (even when results already exist) causes a race condition: the
  // recompute's API calls + DB save fire simultaneously with the
  // CumulativeScorecard's parallel fetches, so the scorecard intermittently
  // reads empty/stale data and fails to render. Score edits already trigger
  // an explicit recompute (saveScoresMutation.onSuccess), and a manual
  // "Recompute" button is available — so auto-recompute is only needed for
  // the first visit when results don't exist yet.
  const hasAutoRecomputed = useRef(false);
  React.useEffect(() => {
    if (round && !hasAutoRecomputed.current && needsComputation) {
      hasAutoRecomputed.current = true;
      recomputeMutation.mutate({ silent: true });
    }
  }, [round?.id, needsComputation]);

  // Multi-day series: let the organizer explicitly declare a child round as the
  // final round. Toggling on distributes the held main (gross/net) purse from
  // cumulative series standings; toggling off holds it for another round.
  const [togglingFinal, setTogglingFinal] = useState(false);
  const [unscoredWarning, setUnscoredWarning] = useState(null);

  // Guard: finalizing computes the main purse from every flight/day's scores,
  // so warn if any round in the series still has players without scores.
  const handleToggleFinalRequest = (checked) => {
    if (checked) {
      const unscored = findUnscoredRounds(seriesRoundsQuery.data);
      if (unscored.length > 0) {
        setUnscoredWarning(unscored);
        return;
      }
    }
    doToggleFinal(checked);
  };

  const doToggleFinal = async (checked) => {
    setTogglingFinal(true);
    try {
      const anchorId = round.parent_round_id || round.id;
      // Hybrid tournaments: the main purse pays on the final day of the final
      // flight. If the organizer finalizes from a flight that isn't flagged as
      // the final one, mark it as final too so the toggle actually pays out.
      const payload = { is_series_final: checked };
      if (checked && isHybrid && !isFinalFlight) payload.is_final_flight = true;
      await base44.entities.Round.update(roundId, payload);
      // Optimistically update BOTH caches so the toggle reflects the change
      // immediately (same rationale as handleToggleFinalFlight).
      queryClient.setQueryData(["round", roundId], (old) => old ? { ...old, ...payload } : old);
      queryClient.setQueryData(["series-rounds", anchorId], (old) => {
        if (!old) return old;
        return old.map(r => r.id === roundId ? { ...r, ...payload } : r);
      });
      queryClient.invalidateQueries({ queryKey: ["series-rounds"] });
      if (checked) {
        // Finalizing the tournament: compute, then land on the tournament-wide
        // final results page (not this single flight/day's Results page).
        recomputeMutation.mutate({}, {
          onSuccess: () => navigate(`/TournamentResults?id=${anchorId}`),
        });
      } else {
        recomputeMutation.mutate();
      }
    } catch (e) {
      toast.error("Failed to update final-day status: " + (e.message || "Unknown error"));
    } finally {
      setTogglingFinal(false);
    }
  };
  const editMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.Round.update(roundId, { status: "scoring" });
      return null;
    },
    onSuccess: () => {
      // Optimistically update cache so Scorecard doesn't see status="completed" and bounce back
      queryClient.setQueryData(["round", roundId], (old) => old ? { ...old, status: "scoring" } : old);
      toast.success("Round reopened for editing");
      navigate(`/Scorecard?id=${roundId}`, { replace: true });
    },
    onError: (e) => toast.error("Error reopening round: " + e.message),
  });

  const saveScoresMutation = useMutation({
    mutationFn: async ({ newScores, playerId }) => {
      const { savePlayerScore } = await import("@/lib/roundScores");

      // Normalize: keep X for DQ, convert empties/zeros to '', everything else to string
      const normalized = newScores.map(s => {
        if (s === null || s === undefined || s === '' || s === 0) return '';
        const str = String(s).trim().toUpperCase();
        if (str === 'X') return 'X';
        const n = parseInt(str, 10);
        return (!isNaN(n) && n >= 1 && n <= 20) ? String(n) : '';
      });

      // 1. Write to RoundScore (authoritative store)
      await savePlayerScore(roundId, playerId, normalized, {});

      // 2. Clear sessionStorage so stale local cache can never override DB
      try {
        const key = `liveScores_${roundId}`;
        const session = JSON.parse(sessionStorage.getItem(key) || '{}');
        const backup = JSON.parse(localStorage.getItem(`liveScores_backup_${roundId}`) || '{}');
        session[playerId] = normalized;
        backup[playerId] = normalized;
        sessionStorage.setItem(key, JSON.stringify(session));
        localStorage.setItem(`liveScores_backup_${roundId}`, JSON.stringify(backup));
      } catch {}

      // 4. Fetch fresh Round.players and update only this player's scores
      const freshRound = await base44.entities.Round.get(roundId);
      const updatedPlayers = (freshRound?.players || []).map(p =>
        p.player_id === playerId ? { ...p, scores: normalized } : p
      );

      // 5. Write updated players back to Round
      await base44.entities.Round.update(roundId, { players: updatedPlayers });

      return { updatedPlayers, normalized, playerId };
    },
    onSuccess: ({ updatedPlayers, normalized, playerId }) => {
      setEditingPlayer(null);
      queryClient.setQueryData(["round", roundId], (old) => old ? { ...old, players: updatedPlayers } : old);
      // Auto-recompute so results always reflect the saved scores immediately
      recomputeMutation.mutate();
    },
    onError: (e) => toast.error("Failed to save scores: " + e.message),
  });

  // Error boundary for unexpected errors
  if (queryError) {
    return (
      <div className="text-center py-20">
        <p className="text-destructive font-medium">Error loading round</p>
        <p className="text-muted-foreground text-sm mt-2">{queryError.message}</p>
        <button type="button" onClick={() => refetchRound()} className="mt-4 px-4 py-2 rounded-md border-2 border-primary bg-primary text-primary-foreground font-medium text-sm">Try Again</button>
        <button type="button" onClick={() => navigate("/Dashboard")} className="mt-2 ml-2 px-4 py-2 rounded-md border-2 border-border bg-card text-foreground font-medium text-sm">Back to Dashboard</button>
      </div>
    );
  }

  // recomputeError is shown inline as a banner — don't block the whole page

  if (isLoading || recomputeMutation.isPending) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 pb-20 pt-20">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <p className="text-center text-muted-foreground text-sm">{isLoading ? "Loading round..." : "Computing results..."}</p>
      </div>
    );
  }

  if (!round) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Round not found.</p>
        <button type="button" onClick={() => navigate("/Dashboard")} className="mt-4 px-4 py-2 rounded-md border-2 border-border bg-card text-foreground font-medium text-sm">Back to Dashboard</button>
      </div>
    );
  }

  if (!round.results || round.results?.total_pot == null) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Results need to be computed.</p>
        <button type="button" onClick={() => recomputeMutation.mutate()} className="mt-4 px-4 py-2 rounded-md border-2 border-primary bg-primary text-primary-foreground font-medium text-sm">Compute Results</button>
        <button type="button" onClick={() => navigate("/Dashboard")} className="mt-2 px-4 py-2 rounded-md border-2 border-border bg-card text-foreground font-medium text-sm">Back to Dashboard</button>
      </div>
    );
  }

  const results = round.results || {};

  const players = round.players || [];

  // Multi-flight: KP is pooled per date, so always use the date-filtered
  // sameDayKp (which holds incomplete days). Falling back to this round's own
  // saved KP would show a tentative per-winner amount that changes as more
  // flights report in.
  const kpSource = isMultiFlight
    ? (sameDayKp?.results || { kp_results: [], kp_separate_pot: 0, kp_per_entry_amount: 0 })
    : results;
  const kpFlightMap = Object.keys(playerFlightPayoutMap).length
    ? playerFlightPayoutMap
    : (sameDayKp?.flightMap || {});
  const kpByFlight = {};
  (kpSource.kp_results || []).forEach(kp => {
    const fn = String(kp.flight || kpFlightMap[kp.player_id] || round.flight_number || 1);
    if (!kpByFlight[fn]) kpByFlight[fn] = [];
    kpByFlight[fn].push(kp);
  });
  const embedKpInFlights = isMultiFlight && flightResultsList.length > 0 && Object.keys(kpByFlight).length > 0;
  const kpPerEntry = Number(kpSource.kp_per_entry_amount) || 0;
  // KP winners are held for the current day until every flight on that date has
  // reported in — the per-winner amount is only final then.
  const kpHeldForToday = isMultiFlight && round?.kps_enabled && !!round.date &&
    !!completeKpDates && !completeKpDates.has(round.date) &&
    (round.kp_winners || []).some(k => k.player_id);

  // Tournament-wide player → team lookup, so team side-game winners (KPs,
  // skins, deuces) display as teams even when pooled across flights/days.
  const teamNameByPlayer = buildTeamNameByPlayer([round, ...(seriesRoundsQuery.data || [])]);

  // Multi-flight final flight: the current day's side games should show THIS
  // flight's own skins pot, not the combined tournament-wide total (which the
  // pot breakdown above shows, labeled). The combined results overwrite
  // gross_skins_allocated_pot to the sum across all flights; use this flight's
  // own pot (preserved by the engine) or fall back to the sum of skin values.
  const currentDaySideResults = (isMultiFlight && results?.is_series_cumulative)
    ? {
        ...(kpSource === results ? results : { ...results, ...kpSource }),
        gross_skins_allocated_pot: results.flight_own_gross_skins_pot || (results.gross_skins || []).reduce((s, k) => s + (k.value || 0), 0),
        net_skins_allocated_pot: results.flight_own_net_skins_pot || (results.net_skins || []).reduce((s, k) => s + (k.value || 0), 0),
        // Deuce pot is combined tournament-wide in the cumulative results, but
        // only this flight's deuce winners are listed — show this flight's pot.
        deuce_pot: results.flight_own_deuce_pot
          || ((results.deuces || []).length * (results.deuce_per_entry_amount || 0)),
      }
    : (kpSource === results ? results : { ...results, ...kpSource });

  const deucePotValue = results.deuce_pot || totalDeucePot;
  const addedMoneyValue = results.added_money || parentAddedMoney.added_money;
  const addedMoneyLabel = results.added_money_label || parentAddedMoney.label || "Added Money";

  return (
    <TooltipProvider>
    <div className="max-w-3xl mx-auto space-y-6 pb-20 sm:pb-0">
      {recomputeError && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
          <span>⚠️ {recomputeError}</span>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={() => recomputeMutation.mutate()} className="font-semibold underline">Retry</button>
            <button type="button" onClick={() => setRecomputeError(null)}>✕</button>
          </div>
        </div>
      )}
      <PageDescription
        title="Round Results"
        description="Complete breakdown of your round including standings, skins winners, KP results, and final payouts."
      />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {isMultiFlight && <FlightNavBar round={round} seriesRounds={seriesRoundsQuery.data} />}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Button variant="edit" size="sm" onClick={() => editMutation.mutate()} disabled={editMutation.isPending} className="gap-2">
            {editMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronLeft className="w-4 h-4" />}
            Edit Round
          </Button>
          {round?.is_multi_day && (
            isMultiFlight && flightAddDayOptions.length > 1 ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="secondary" size="sm" className="gap-2 bg-logistics text-logistics-foreground hover:bg-logistics/90">
                    <CalendarDays className="w-4 h-4" />
                    Add Day
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-1" align="start">
                  <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">Choose a flight</p>
                  {flightAddDayOptions.map(r => (
                    <button
                      key={r.id}
                      onClick={() => navigate(`/SetupWizard?addDay=${r.id}`)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-sm text-foreground transition-colors"
                    >
                      <CalendarDays className="w-3.5 h-3.5 text-logistics" />
                      Flight {r.flight_number || 1}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/SetupWizard?addDay=${round.id}`)}
                className="gap-2 bg-logistics text-logistics-foreground hover:bg-logistics/90"
              >
                <CalendarDays className="w-4 h-4" />
                {isMultiFlight ? `Add Day → Flight ${round.flight_number || 1}` : 'Add Day'}
              </Button>
            )
          )}
          {isMultiFlight && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(`/SetupWizard?addFlight=${round.parent_round_id || round.id}`)}
              className="gap-2 bg-logistics text-logistics-foreground hover:bg-logistics/90"
            >
              <Layers className="w-4 h-4" />
              Add Flight
            </Button>
          )}
          {(round?.is_multi_day || isMultiFlight) && (
            <Button
              variant="default"
              size="sm"
              onClick={() => navigate(`/TournamentHub?id=${round.parent_round_id || round.id}`)}
              className="gap-2"
            >
              <Trophy className="w-4 h-4" />
              Tournament Hub
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setSendModalOpen(true)} className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
            <Send className="w-4 h-4" />
            Send Results
          </Button>
          <Button variant={editMode ? "default" : "edit"} size="sm" onClick={() => setEditMode(!editMode)} className="gap-2">
            <Edit2 className="w-4 h-4" />
            Edit Scores
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="default" size="icon" onClick={() => recomputeMutation.mutate()} disabled={recomputeMutation.isPending} className="w-9 h-9">
                {recomputeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent><p className="text-xs">Recompute results from current scores</p></TooltipContent>
          </Tooltip>
        </div>

        {/* Final Day toggle — hybrid: available on all rounds (including
            parent); non-hybrid: child rounds only (parent is Day 1).
            Always visible (even after marking) so the organizer can toggle
            it back off — no exceptions. */}
        {isMultiDay && (round.parent_round_id || isHybrid) && (
          isHybrid ? (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border-2 border-border bg-card p-3">
              <div className="flex items-start gap-2">
                <CalendarDays className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">This is the final day of the series</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                    {isFinalDay
                      ? "On — main gross & net purse pays out from Field Standings (cumulative across all flights and days)."
                      : "Off — main purse is held. Switch this on once ALL flights and days are finished to pay out the tournament from the Field Standings."}
                  </p>
                </div>
              </div>
              <Switch
                checked={isFinalDayFlag}
                onCheckedChange={handleToggleFinalRequest}
                disabled={togglingFinal || recomputeMutation.isPending}
              />
            </div>
          ) : (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border-2 border-border bg-card p-3">
              <div className="flex items-start gap-2">
                <CalendarDays className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">This is the final {seriesLabel.toLowerCase()} of the series</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                    {isFinalDay
                      ? isMultiFlight
                        ? "On — main gross & net purse pays out from Field Standings (all flights combined)."
                        : "On — main gross & net purse pays out from cumulative series standings."
                      : `Off — main purse is held for another ${seriesLabel.toLowerCase()}. Side games (skins, KPs, deuces) settle today.`}
                  </p>
                </div>
              </div>
              <Switch
                checked={isFinalDay}
                onCheckedChange={handleToggleFinalRequest}
                disabled={togglingFinal || recomputeMutation.isPending}
              />
            </div>
          )
        )}

        {holdMainPayouts && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-primary/10 border border-primary/30 p-3">
            <CalendarDays className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-sm text-foreground leading-relaxed">
              <span className="font-semibold">{isHybrid ? 'Multi-Day + Multi-Flight Tournament' : isMultiFlight ? 'Multi-Flight Tournament' : 'Multi-Day Series'} — Main purse held.</span>{" "}
              Gross &amp; net payouts are held until the final {seriesLabel.toLowerCase()}. Only side games
              (skins, KPs, deuces) settle today.
            </p>
          </div>
        )}

        {finalDayOfFlight && !isFinalDay && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-300 p-3">
            <Trophy className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-emerald-900 leading-relaxed">
              <span className="font-semibold">Flight {round?.flight_number || 1} Final Day — Flight payouts shown.</span>{" "}
              This flight's gross &amp; net payouts are based on cumulative scores across all days of Flight {round?.flight_number || 1}.
              The overall tournament Field Standings (all flights combined) pay out on the final flight's final day.
            </p>
          </div>
        )}

        {isMultiFlight && !isHybrid && !isFinalDay && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-primary/10 border border-primary/30 p-3">
            <CalendarDays className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-sm text-foreground leading-relaxed">
              <span className="font-semibold">Multi-Flight Tournament — Field prize held.</span>{" "}
              This flight pays its own gross, net &amp; side games. The Low Gross/Net of the Field pays on the final {seriesLabel.toLowerCase()}.
            </p>
          </div>
        )}

        {isMultiFlight && !holdMainPayouts && combinedResults?.is_series_cumulative && (combinedResults.field_gross_prize > 0 || combinedResults.field_net_prize > 0) && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-300 p-3">
            <Trophy className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-emerald-900 leading-relaxed">
              <span className="font-semibold">Low Gross of the Field:</span> {combinedResults.field_gross_winner?.name || 'N/A'} (${Math.round(combinedResults.field_gross_prize || 0)})
              <br />
              <span className="font-semibold">Low Net of the Field:</span> {combinedResults.field_net_winner?.name || 'N/A'} (${Math.round(combinedResults.field_net_prize || 0)})
              <br />
              <span className="text-xs">Each flight pays its own gross, net &amp; side games. Only the field prize is combined.</span>
            </p>
          </div>
        )}
        {isMultiDay && !isMultiFlight && !holdMainPayouts && results?.is_series_cumulative && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-300 p-3">
            <Trophy className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-emerald-900 leading-relaxed">
              <span className="font-semibold">Final Round — Series Cumulative Standings.</span>{" "}
              Gross &amp; net payouts reflect combined scores across all {results.series_days || ""} day{results.series_days > 1 ? "s" : ""} of this series.
            </p>
          </div>
        )}

        {/* Pot breakdown */}
        {isMultiFlight && results?.is_series_cumulative && (
          <p className="text-xs text-muted-foreground mb-2 font-medium">Pot breakdown — tournament totals (all flights combined)</p>
        )}
        {results.total_pot > 0 && <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            ...(!holdMainPayouts && results.gross_pot > 0 ? [{ 
              label: isMultiFlight && results?.is_series_cumulative ? "Gross Pot (all flights)" : "Gross Pot", 
              value: results.gross_pot,
              // Multi-flight combined: the derived places are combined-pot amounts
              // nobody is paid (each flight pays its own pot) — hide them.
              places: isMultiFlight && results?.is_series_cumulative ? null : results.gross_places,
              tip: "The portion of the main pot allocated to gross score (raw stroke) standings." 
            }] : []),
            ...(!holdMainPayouts && results.net_pot > 0 ? [{ 
              label: isMultiFlight && results?.is_series_cumulative ? "Net Pot (all flights)" : "Net Pot", 
              value: results.net_pot,
              places: isMultiFlight && results?.is_series_cumulative ? null : results.net_places,
              tip: "The portion of the main pot allocated to net score (handicap-adjusted) standings." 
            }] : []),
            ...(isMultiFlight && !holdMainPayouts && results.field_gross_prize > 0 ? [{ label: "Field Gross", value: results.field_gross_prize, tip: "Multi-flight: percentage of the total tournament pot awarded to the overall Low Gross player across all flights." }] : []),
            ...(isMultiFlight && !holdMainPayouts && results.field_net_prize > 0 ? [{ label: "Field Net", value: results.field_net_prize, tip: "Multi-flight: percentage of the total tournament pot awarded to the overall Low Net player across all flights." }] : []),
            ...(results.side_pot > 0 ? [{ label: "Side Games", value: results.side_pot, tip: "Pot allocated to side games like skins and KPs that are part of the main buy-in." }] : []),
            ...(results.kp_separate_pot > 0 ? [{ label: "KP Pot", value: results.kp_separate_pot, tip: "Separate pot funded by KP buy-ins. Split among closest-to-the-pin winners." }] : []),
            ...(results.gross_skins_separate_pot > 0 ? [{ label: "Gross Skins", value: results.gross_skins_separate_pot, tip: "Separate pot funded by gross skins buy-ins. Won by players with the lowest gross score on each hole." }] : []),
            ...(results.net_skins_separate_pot > 0 ? [{ label: "Net Skins", value: results.net_skins_separate_pot, tip: "Separate pot funded by net skins buy-ins. Won by players with the lowest net (handicap-adjusted) score on each hole." }] : []),
            ...(deucePotValue > 0 ? [{ label: "Deuce Pot", value: deucePotValue, tip: "Separate pot funded by deuce buy-ins. Split equally among players who made a 2 on a par-3." }] : []),
            ...(addedMoneyValue > 0 ? [{ label: addedMoneyLabel, value: addedMoneyValue, tip: "Lump sum folded into the main gross/net pot. For multi-flight tournaments, splits across flights proportionally by player count." }] : []),
            { label: "Total Pot", value: results.total_pot, isTotal: true, tip: "Total tournament pot from all player buy-ins plus added money, across all flights." },
          ].map(item => (
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
        </div>}

        {/* Per-flight results (multi-flight tournament) — shown at the top for
            team events so each flight's standings + KP winners appear first,
            matching the individual layout. Only on the final flight (and final
            day for hybrid), since all_flight_standings and field prizes are only
            computed then. */}
        {isMultiFlight && flightResultsList.length > 0 && (round.game_type && round.game_type !== "individual") && (
          <div className="mt-2 space-y-3">
            <p className="text-sm font-bold text-foreground">Per-Flight Results</p>
            {holdMainPayouts && (
              <p className="text-xs text-muted-foreground -mt-1">Standings shown — gross &amp; net payouts are held until the final day. Only side games settle today.</p>
            )}
            {flightResultsList.map(fr => {
              const fn = String(fr.flightNumber || fr.round.flight_number || 1);
              const perFlight = perFlightPayouts.find(p => p.flightLabel === fr.flightLabel);
              const flightPayouts = perFlight?.flightResults?.payouts || fr.results?.payouts || [];
              return (
                <div key={fr.round.id} className="space-y-2">
                  {!isRedundantFlightCard(fn) && (
                    <FlightStandings round={fr.round} results={fr.results} flightLabel={fr.flightLabel} payouts={flightPayouts} holdMainPayouts={holdMainPayouts} forceStacked placesCount={Math.max(results.gross_places?.length || 3, results.net_places?.length || 3)} />
                  )}
                  {embedKpInFlights && (
                    <FlightKpWinners kps={kpByFlight[fn] || []} perEntryAmount={kpPerEntry} flightDayLabels={flightDayLabels} flightNumber={fn} round={round} teamNameByPlayer={teamNameByPlayer} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Team or Individual standings — hidden for multi-flight while payouts
            are held, since the grouped per-flight list already shows this flight. */}
        {!hideMainStandings && (
          <div className="mt-2">
            {round.game_type && round.game_type !== "individual" ? (
              editMode ? (
                <TeamStandings results={results} round={round} players={players} onEditScore={setEditingPlayer} editMode={editMode} holdMainPayouts={holdMainPayouts} />
              ) : (
                <FlightStandings
                  round={round}
                  results={results}
                  flightLabel={round.flight_name || round.event_name}
                  payouts={results.payouts}
                  holdMainPayouts={holdMainPayouts}
                  forceStacked
                />
              )
            ) : (
              <GrossNetResults results={results} round={round} players={players} onEditScore={setEditingPlayer} editMode={editMode} holdMainPayouts={holdMainPayouts} isMultiFlight={isMultiFlight} />
            )}
          </div>
        )}

        {/* Field Prizes — Low Gross/Net of the Field (multi-flight tournament) */}
        {isMultiFlight && combinedResults?.is_series_cumulative && (combinedResults.field_gross_winner || combinedResults.field_net_winner) && (
          <div className="mt-2">
            <FieldPrizesCard results={combinedResults} />
          </div>
        )}

        {/* Final flight banner — makes it clear this page holds the combined
            final results for the entire multi-flight tournament. */}
        {isMultiFlight && combinedResults && !holdMainPayouts && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-primary/10 border border-primary/30 p-3">
            <Trophy className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-sm text-foreground leading-relaxed">
              <span className="font-semibold">{isHybrid ? 'Tournament Final Results — Final Day of the Final Flight' : 'Tournament Final Results'}</span>{" "}
              This page shows the combined Field Standings (all flights), each flight's own gross &amp; net winners, and the final payout table for the entire tournament.
            </p>
          </div>
        )}

        {/* Per-flight results (multi-flight tournament) — individual events keep
            the original position (after the main standings). Only on the final
            flight (and final day for hybrid), since all_flight_standings and
            field prizes are only computed then. */}
        {isMultiFlight && flightResultsList.length > 0 && !(round.game_type && round.game_type !== "individual") && (
          <div className="mt-2 space-y-3">
            <p className="text-sm font-bold text-foreground">Per-Flight Results</p>
            {holdMainPayouts && (
              <p className="text-xs text-muted-foreground -mt-1">Standings shown — gross &amp; net payouts are held until the final day. Only side games settle today.</p>
            )}
            {flightResultsList.map(fr => {
              const fn = String(fr.flightNumber || fr.round.flight_number || 1);
              const perFlight = perFlightPayouts.find(p => p.flightLabel === fr.flightLabel);
              const flightPayouts = perFlight?.flightResults?.payouts || fr.results?.payouts || [];
              return (
                <div key={fr.round.id} className="space-y-2">
                  {!isRedundantFlightCard(fn) && (
                    <FlightStandings round={fr.round} results={fr.results} flightLabel={fr.flightLabel} payouts={flightPayouts} holdMainPayouts={holdMainPayouts} forceStacked placesCount={Math.max(results.gross_places?.length || 3, results.net_places?.length || 3)} />
                  )}
                  {embedKpInFlights && (
                    <FlightKpWinners kps={kpByFlight[fn] || []} perEntryAmount={kpPerEntry} flightDayLabels={flightDayLabels} flightNumber={fn} round={round} teamNameByPlayer={teamNameByPlayer} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Prior days' side games (multi-day series). For non-hybrid multi-flight,
            KP is tournament-wide so it's suppressed here and shown once on the
            final (current) day's section from the combined results. */}
        {sideGameDays.map(d => (
          <SideGamesSection key={d.round.id} round={d.round} results={d.results} dayLabel={d.dayLabel} suppressKP={isMultiFlight} teamNameByPlayer={teamNameByPlayer} />
        ))}

        {/* Current day side games. For hybrid multi-flight, pass the player→flight
            map and flight/day labels so the tournament-wide KP winners are grouped
            by flight and day (each showing the same pooled per-entry amount). */}
        <SideGamesSection
          round={round}
          results={currentDaySideResults}
          suppressKP={embedKpInFlights}
          dayLabel={isMultiDay ? dayLabel : null}
          playerFlightMap={isMultiFlight ? (Object.keys(playerFlightPayoutMap).length ? playerFlightPayoutMap : (sameDayKp?.flightMap || null)) : null}
          flightLabels={isMultiFlight ? flightLabels : null}
          flightDayLabels={isMultiFlight ? flightDayLabels : null}
          teamNameByPlayer={teamNameByPlayer}
        />

        {/* KPs enabled but no winners recorded (current round only) */}
        {round.kps_enabled && (round.kp_winners || []).filter(kp => kp.player_id).length === 0 && (
          <Card className="border-0 shadow-sm mt-4">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">KPs were enabled but no winners were recorded. Check the scorecard to add KP winners.</p>
            </CardContent>
          </Card>
        )}

        {/* Multi-flight: KP winners held until all flights on this day report in */}
        {kpHeldForToday && (
          <Card className="border-0 shadow-sm mt-4 bg-primary/5 border border-primary/20">
            <CardContent className="p-5">
              <p className="text-sm text-foreground leading-relaxed">
                <span className="font-semibold">KP results are held for today.</span>{" "}
                The per-winner amount is pooled across every flight on this date, so it's finalized only once all flights have reported in. KP winners will appear here once the day is complete.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Cumulative series scorecard — per-day breakdown for multi-day events.
            Multi-flight skips this (each player plays one flight, no cumulative card). */}
        {isMultiDay && !isMultiFlight && (
          <div className="mt-3">
            <CumulativeScorecard round={round} />
          </div>
        )}

        {/* Payout Table — per flight for multi-flight tournaments. While the
            main purse is held (Day 1), each flight's own side-game payouts are
            shown in a separate table so all flights appear — not just the
            current one. After finalization, combined per-flight payouts. */}
        {isMultiFlight && flightResultsList.length > 0 && (holdMainPayouts || (combinedResults && perFlightPayouts.length > 0)) ? (
          holdMainPayouts ? (
            flightResultsList.map(fr => (
              <div key={fr.round.id || fr.flightLabel} className="mt-3 tour-results-payouts">
                <p className="text-sm font-bold text-foreground mb-1">{fr.flightLabel} — Payouts</p>
                <PayoutTable results={fr.results || {}} holdMainPayouts payoutDays={[]} />
              </div>
            ))
          ) : (
            perFlightPayouts.map(fp => (
              <div key={fp.flightLabel} className="mt-3 tour-results-payouts">
                <p className="text-sm font-bold text-foreground mb-1">{fp.flightLabel} — Final Payouts</p>
                <PayoutTable results={fp.flightResults} holdMainPayouts={holdMainPayouts} payoutDays={fp.flightPayoutDays} />
              </div>
            ))
          )
        ) : (
          <div className="mt-3 tour-results-payouts">
            <PayoutTable results={results} holdMainPayouts={holdMainPayouts} payoutDays={isMultiFlight && !isHybrid ? [] : (finalDayOfFlight ? payoutDays.filter(d => d.dayLabel?.startsWith(`${flightNameFor(round?.flight_number || 1)},`)) : payoutDays)} />
          </div>
        )}
        </motion.div>

        <FinalizeWarningDialog
          open={!!unscoredWarning}
          onOpenChange={(o) => { if (!o) setUnscoredWarning(null); }}
          unscored={unscoredWarning || []}
          onConfirm={() => { setUnscoredWarning(null); doToggleFinal(true); }}
        />
        <SendResultsModal
          isOpen={sendModalOpen}
          onClose={() => setSendModalOpen(false)}
          round={allTournamentPlayers ? { ...round, players: allTournamentPlayers } : round}
          results={results}
          dayLabel={dayLabel}
          flightData={isMultiDay ? {
            ...(isMultiFlight && flightResultsList.length > 0 ? {
              flights: flightResultsList.map(fr => ({
                flightNumber: fr.flightNumber,
                flightLabel: fr.flightLabel,
                gross_results: fr.results?.gross_results || [],
                net_results: fr.results?.net_results || [],
                team_gross_results: fr.results?.team_gross_results || [],
                team_net_results: fr.results?.team_net_results || [],
              })),
              playerFlightMap: playerFlightPayoutMap,
            } : {}),
            sideGames: sideGamesEntries,
          } : undefined}
        />
        <ScoreEditModal
        isOpen={!!editingPlayer}
        onClose={() => setEditingPlayer(null)}
        player={editingPlayer}
        round={round}
        roundPlayers={players}
        initialScores={editingPlayer ? (players.find(p => p.player_id === editingPlayer.player_id)?.scores || []) : []}
        onSave={(newScores) => saveScoresMutation.mutate({ newScores, playerId: editingPlayer?.player_id })}
        isSaving={saveScoresMutation.isPending}
        />
        </div>
        </TooltipProvider>
        );
        }