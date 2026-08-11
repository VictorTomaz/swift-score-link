import React, { useEffect, useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { computeResults } from "@/lib/swiftScoreEngine";
import { computeSeriesResults, computeTeamSeriesResults } from "@/lib/seriesResults";
import { computeFlightSeriesResults, computeHybridSeriesResults } from "@/lib/flightResults";
import { useSeriesRounds, isSeriesFinalDay, isFinalFlightRound, isFinalDayRaw } from "@/hooks/useSeriesRounds";
import { computeTeamResults, applyTeamPayouts, computeTeamSkins, splitTeamSideGamePayouts } from "@/lib/teamScoreEngine";
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
import FieldPrizesCard from "@/components/results/FieldPrizesCard";
import ScoreEditModal from "@/components/results/ScoreEditModal";
import SendResultsModal from "@/components/results/SendResultsModal";
import CumulativeScorecard from "@/components/scorecard/CumulativeScorecard";
import PageDescription from "@/components/PageDescription";

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
  const { data: round, isLoading, error: queryError } = useQuery({
    queryKey: ["round", roundId],
    queryFn: async () => {
      console.log('[Results] Fetching round:', roundId);
      const rounds = await base44.entities.Round.filter({ id: roundId });
      console.log('[Results] Fetched rounds:', rounds);
      return rounds[0];
    },
    enabled: !!roundId,
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
  const isFinalFlight = isFinalFlightRound(round, seriesRoundsQuery.data);
  // True if any round in the series already has is_final_flight set — there can
  // only be one final flight, so once any flight is marked, the toggle hides everywhere.
  const isFinalDayFlag = isFinalDayRaw(round, seriesRoundsQuery.data);
  const isMultiDay = !!(round?.is_multi_day || round?.is_multi_flight);
  const isMultiFlight = isMultiDay && (round?.is_multi_flight || round?.series_type === 'multi_flight');
  const isHybrid = !!(round?.is_multi_day && round?.is_multi_flight);
  // True if any round in the series already has is_final_flight set — there can
  // only be one final flight, so once any flight is marked, the toggle hides everywhere.
  const flightAlreadyMarkedFinal = React.useMemo(() => {
    if (!isHybrid) return false;
    const all = (seriesRoundsQuery.data || []).filter(Boolean);
    return all.some(r => r.is_final_flight === true && r.id !== round?.id);
  }, [isHybrid, round?.id, seriesRoundsQuery.data]);
  const holdMainPayouts = isMultiDay && !isFinalDay && (!isMultiFlight || isHybrid);
  // Hybrid (multi-day + multi-flight): the main purse pays on the final DAY of
  // the final flight, not just when you reach the final flight — so the toggle
  // label uses "day". Multi-flight-only tournaments are single-day, so "flight"
  // is correct there. Multi-day-only uses "day".
  const seriesLabel = (isMultiFlight && !isHybrid) ? 'Flight' : 'Day';

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
      return idx >= 0 ? `Flight ${fn}, Day ${idx + 1}` : null;
    }
    const sorted = [...all].sort((a, b) => new Date(a.date) - new Date(b.date));
    const currentInSorted = sorted.find(r => r.id === round?.id);
    if (!currentInSorted) return null;
    if (isMultiFlight && currentInSorted.flight_number) {
      return `Flight ${currentInSorted.flight_number}`;
    }
    const idx = sorted.findIndex(r => r.id === round?.id);
    return idx >= 0 ? `${seriesLabel} ${idx + 1}` : null;
  }, [isMultiDay, isHybrid, isMultiFlight, seriesRoundsQuery.data, round?.id, round?.flight_number, seriesLabel]);

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
          label = `Flight ${fn}, Day ${dayIdx + 1}`;
        } else {
          label = isMultiFlight && r.flight_number
            ? `Flight ${r.flight_number}`
            : `${seriesLabel} ${sorted.findIndex(rr => rr.id === r.id) + 1}`;
        }
        return { round: r, results: r.results || {}, dayLabel: label };
      })
      .filter(d => d.round.id !== round?.id);
  }, [isMultiDay, isHybrid, isMultiFlight, seriesRoundsQuery.data, round?.id, seriesLabel]);

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
        label = `Flight ${fn}, Day ${dayIdx + 1}`;
      } else {
        label = isMultiFlight && r.flight_number
          ? `Flight ${r.flight_number}`
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
  }, [isMultiDay, isHybrid, isMultiFlight, seriesRoundsQuery.data, round?.id, seriesLabel]);

  // All flights' per-flight results — shown on the final flight's Results page
  // so each flight's own gross/net winners are visible alongside the Field Standings.
  const flightResultsList = React.useMemo(() => {
    if (!isMultiFlight) return [];
    const all = (seriesRoundsQuery.data || []).filter(Boolean);

    // No double dipping: field prize winners are removed from their own
    // flight's per-flight standings so they don't appear as flight winners too.
    // Gross winners stay in the net display (with $0 net payout) so each
    // flight shows the full number of paid places instead of leaving gaps.
    const fieldGrossId = round?.results?.field_gross_winner?.player_id;
    const fieldNetId = round?.results?.field_net_winner?.player_id;
    // Identify flight gross winners (gross_payout > 0) to remove from net
    // standings — no double dipping: a gross winner can't also appear as a
    // net winner. The current flight's standings are already filtered by
    // computeFlightSeriesResults, but sibling flights' saved results are not.
    const grossWinnerIds = new Set(
      (round?.results?.payouts || [])
        .filter(p => (p.gross_payout || 0) > 0)
        .map(p => p.player_id)
    );
    const filterFieldWinners = (res) => {
      if (!res) return res;
      const gr = Array.isArray(res.gross_results)
        ? res.gross_results.filter(r => r.player_id !== fieldGrossId && r.player_id !== fieldNetId)
        : res.gross_results;
      const nr = Array.isArray(res.net_results)
        ? res.net_results.filter(r => r.player_id !== fieldNetId && r.player_id !== fieldGrossId && !grossWinnerIds.has(r.player_id))
        : res.net_results;
      return { ...res, gross_results: gr, net_results: nr };
    };

    // Hybrid: group by flight_number, use latest-dated round per flight
    if (isHybrid) {
      // Prefer all_flight_standings from the final round's results — it has
      // cumulative per-flight standings for ALL flights (not just the current
      // one). Sibling rounds' saved results are per-day, so they can't be used
      // for cumulative per-flight display.
      const allStandings = round?.results?.all_flight_standings;
      if (allStandings && allStandings.length > 0) {
        // all_flight_standings already has field winners AND gross winners
        // removed from net standings (no double dipping), so the display shows
        // the actual net payout recipients. Do NOT re-apply filterFieldWinners.
        return allStandings
          .sort((a, b) => (a.flightNumber || 0) - (b.flightNumber || 0))
          .map(fs => ({
            round: { id: `standings_${fs.flightNumber}`, event_name: `Flight ${fs.flightNumber}`, course_name: round?.course_name },
            results: { gross_results: fs.gross_results, net_results: fs.net_results },
            flightLabel: `Flight ${fs.flightNumber}`,
          }));
      }
      // Fallback: use latest-dated round per flight (per-day, not cumulative)
      const flightMap = {};
      all.forEach(r => {
        const fn = r.flight_number || 1;
        if (!flightMap[fn] || new Date(r.date) > new Date(flightMap[fn].date)) {
          flightMap[fn] = r;
        }
      });
      return Object.entries(flightMap)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([fn, r]) => ({
          round: r,
          results: filterFieldWinners(
            r.id === round?.id
              ? { gross_results: round?.results?.flight_own_gross, net_results: round?.results?.flight_own_net }
              : (r.results || {})
          ),
          flightLabel: `Flight ${Number(fn)}`,
        }));
    }

    // Non-hybrid: one round per flight. Use flight_number for the label
    // (not array index) so Flight 3 shows as "Flight 3" even if it's the
    // only round returned by the series query.
    const sorted = [...all].sort((a, b) => new Date(a.date) - new Date(b.date));
    return sorted.map((r) => ({
      round: r,
      results: filterFieldWinners(
        r.id === round?.id
          ? { gross_results: round?.results?.flight_own_gross, net_results: round?.results?.flight_own_net }
          : (r.results || {})
      ),
      flightLabel: `Flight ${r.flight_number || sorted.indexOf(r) + 1}`,
    }));
  }, [isMultiFlight, isHybrid, seriesRoundsQuery.data, round?.id, round?.results, seriesLabel]);

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
    if (round?.results?.player_flight_map) return round.results.player_flight_map;
    const map = {};
    flightResultsList.forEach(fr => {
      const fn = (fr.flightLabel || '').replace('Flight ', '').trim();
      [...(fr.results?.gross_results || []), ...(fr.results?.net_results || [])].forEach(r => {
        if (r.player_id && !map[r.player_id]) map[r.player_id] = fn;
      });
    });
    // Field winners are missing from per-flight standings — find their flight
    // from the combined field standings, which have a 'flight' label like
    // "Flight 2" or "Flight 2 Day 1".
    const fieldStandings = [...(round?.results?.gross_results || []), ...(round?.results?.net_results || [])];
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
    if (!isMultiFlight || !isFinalFlight || holdMainPayouts || !flightResultsList.length) return [];
    const res = round?.results || {};
    return flightResultsList.map(fr => {
      const fn = (fr.flightLabel || '').replace('Flight ', '').trim();
      const flightPayouts = (res.payouts || [])
        .filter(p => playerFlightPayoutMap[p.player_id] === fn)
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
            .filter(d => d.dayLabel?.startsWith(`Flight ${fn},`))
            .map(d => ({ ...d, dayLabel: d.dayLabel.replace(`Flight ${fn}, `, ''), isCurrent: false }))
        : [];
      return {
        flightLabel: fr.flightLabel,
        flightResults: { ...res, payouts: flightPayouts },
        flightPayoutDays,
      };
    });
  }, [isMultiFlight, isFinalFlight, holdMainPayouts, flightResultsList, round?.results, playerFlightPayoutMap, isHybrid, payoutDays]);

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
    (isTeamRound && !(round.results?.team_gross_results?.length > 0)) ||
    // Multi-day series: a non-final day must never hold cumulative results, and
    // the final day must have them. Recompute when stale — e.g. a day that was
    // final when it computed (and saved is_series_cumulative) but is no longer
    // the latest day after a later round was added.
    (isMultiDay && seriesLoaded && !!round.results?.is_series_cumulative !== isFinalDay) ||
    // Multi-day final round: also recompute when a sibling day has no saved
    // results (e.g. cleared by the stale-cumulative self-heal) so its per-day
    // scores get recomputed and persisted for the scorecard/PDF.
    (isMultiDay && isFinalDay && seriesLoaded && (seriesRoundsQuery.data || []).some(s => s.id !== round?.id && !s.results))
  );

  const recomputeMutation = useMutation({
    mutationFn: async ({ silent = false } = {}) => {
      console.log('[Results] Starting recompute for round:', roundId);
      
      const freshRounds = await base44.entities.Round.filter({ id: roundId });
      console.log('[Results] Fresh rounds:', freshRounds);
      
      let freshRound = freshRounds[0];
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
        const isAggregate = freshRound.game_type === 'team_aggregate' ||
          (freshRound.team_mode === true && freshRound.team_format === 'aggregate');
        const skinsTeamMode = !isAggregate && freshRound.skins_team_mode !== false;
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
          for (const sib of siblingRounds) {
            // Always build a merged-scores copy of the sibling so team results can
            // be computed even when the saved results lack team standings.
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
            if (!sibRes || !sibRes.gross_results || sibRes.is_series_cumulative || sibRes.is_flight_cumulative || hasFieldWideData) {
              try {
                const sibCompute = computeResults(sibRound);
                if (sibCompute.success) { sibRes = sibCompute.results; sibRecomputed = true; }
              } catch (e) {
                console.log('[Results] Series sibling compute failed:', e.message);
              }
            }
            if (sibRes && sibRes.gross_results) {
              // Team series: ensure sibling has team standings for cross-day aggregation.
              if (isTeamSeries && !sibRes.team_gross_results) {
                try {
                  const sibTeam = computeTeamResults({ ...sibRound, results: sibRes });
                  sibRes.team_gross_results = sibTeam.team_gross_results;
                  sibRes.team_net_results = sibTeam.team_net_results;
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
  const [togglingFinalFlight, setTogglingFinalFlight] = useState(false);
  const handleToggleFinal = async (checked) => {
    setTogglingFinal(true);
    try {
      await base44.entities.Round.update(roundId, { is_series_final: checked });
      queryClient.setQueryData(["round", roundId], (old) => old ? { ...old, is_series_final: checked } : old);
      queryClient.invalidateQueries({ queryKey: ["series-rounds"] });
      recomputeMutation.mutate();
    } catch (e) {
      toast.error("Failed to update final-day status: " + (e.message || "Unknown error"));
    } finally {
      setTogglingFinal(false);
    }
  };
  const handleToggleFinalFlight = async (checked) => {
    setTogglingFinalFlight(true);
    try {
      await base44.entities.Round.update(roundId, { is_final_flight: checked });
      queryClient.setQueryData(["round", roundId], (old) => old ? { ...old, is_final_flight: checked } : old);
      queryClient.invalidateQueries({ queryKey: ["series-rounds"] });
      recomputeMutation.mutate();
    } catch (e) {
      toast.error("Failed to update final-flight status: " + (e.message || "Unknown error"));
    } finally {
      setTogglingFinalFlight(false);
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
      const freshRounds = await base44.entities.Round.filter({ id: roundId });
      const freshRound = freshRounds[0];
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
        <button type="button" onClick={() => navigate("/Dashboard")} className="mt-4 px-4 py-2 rounded-md border-2 border-border bg-card text-foreground font-medium text-sm">Back to Dashboard</button>
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

        {isMultiDay && round.parent_round_id && round.is_series_final !== true && (
          isHybrid ? (
            <>
              {/* Final Flight toggle — mark when done adding flights.
                  Hides once this round OR any sibling in the same flight is marked. */}
              {round.is_final_flight !== true && !flightAlreadyMarkedFinal && (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border-2 border-border bg-card p-3">
                  <div className="flex items-start gap-2">
                    <Layers className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">This is the final flight of the tournament</p>
                      <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                        Turn on when you're done adding flights. You can still add more days to this flight — side games settle day-by-day until the final day.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={isFinalFlight}
                    onCheckedChange={handleToggleFinalFlight}
                    disabled={togglingFinalFlight || recomputeMutation.isPending}
                  />
                </div>
              )}
              {/* Final Day toggle — visible alongside the Final Flight toggle
                  until it's switched on. Disabled until the final flight is marked. */}
              <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border-2 border-border bg-card p-3">
                <div className="flex items-start gap-2">
                  <CalendarDays className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">This is the final day of the series</p>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                      {isFinalDay
                        ? "On — main gross & net purse pays out from Field Standings (cumulative across all flights and days)."
                        : isFinalFlight
                          ? "Off — main purse is held for another day. Side games (skins, KPs, deuces) settle today."
                          : "Mark the final flight first, then switch this on when you're done adding days."}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={isFinalDayFlag}
                  onCheckedChange={handleToggleFinal}
                  disabled={!isFinalFlight || togglingFinal || recomputeMutation.isPending}
                />
              </div>
            </>
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
                onCheckedChange={handleToggleFinal}
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

        {isMultiFlight && !isHybrid && !isFinalDay && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-primary/10 border border-primary/30 p-3">
            <CalendarDays className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-sm text-foreground leading-relaxed">
              <span className="font-semibold">Multi-Flight Tournament — Field prize held.</span>{" "}
              This flight pays its own gross, net &amp; side games. The Low Gross/Net of the Field pays on the final {seriesLabel.toLowerCase()}.
            </p>
          </div>
        )}

        {isMultiDay && !holdMainPayouts && results?.is_series_cumulative && (!isMultiFlight || results.field_gross_prize > 0 || results.field_net_prize > 0) && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-300 p-3">
            <Trophy className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-emerald-900 leading-relaxed">
              {isMultiFlight
                ? <>
                    <span className="font-semibold">Low Gross of the Field:</span> {results.field_gross_winner?.name || 'N/A'} (${Math.round(results.field_gross_prize || 0)})
                    <br />
                    <span className="font-semibold">Low Net of the Field:</span> {results.field_net_winner?.name || 'N/A'} (${Math.round(results.field_net_prize || 0)})
                    <br />
                    <span className="text-xs">Each flight pays its own gross, net &amp; side games. Only the field prize is combined.</span>
                  </>
                : <>
                    <span className="font-semibold">Final Round — Series Cumulative Standings.</span>{" "}
                    Gross &amp; net payouts reflect combined scores across all {results.series_days || ""} day{results.series_days > 1 ? "s" : ""} of this series.
                  </>}
            </p>
          </div>
        )}

        {/* Pot breakdown */}
        {results.total_pot > 0 && <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            ...(!holdMainPayouts && results.gross_pot > 0 ? [{ 
              label: "Gross Pot", 
              value: results.gross_pot,
              places: results.gross_places,
              tip: "The portion of the main pot allocated to gross score (raw stroke) standings." 
            }] : []),
            ...(!holdMainPayouts && results.net_pot > 0 ? [{ 
              label: "Net Pot", 
              value: results.net_pot,
              places: results.net_places,
              tip: "The portion of the main pot allocated to net score (handicap-adjusted) standings." 
            }] : []),
            ...(isMultiFlight && !holdMainPayouts && results.field_gross_prize > 0 ? [{ label: "Field Gross", value: results.field_gross_prize, tip: "Multi-flight: percentage of the total tournament pot awarded to the overall Low Gross player across all flights." }] : []),
            ...(isMultiFlight && !holdMainPayouts && results.field_net_prize > 0 ? [{ label: "Field Net", value: results.field_net_prize, tip: "Multi-flight: percentage of the total tournament pot awarded to the overall Low Net player across all flights." }] : []),
            ...(results.side_pot > 0 ? [{ label: "Side Games", value: results.side_pot, tip: "Pot allocated to side games like skins and KPs that are part of the main buy-in." }] : []),
            ...(results.kp_separate_pot > 0 ? [{ label: "KP Pot", value: results.kp_separate_pot, tip: "Separate pot funded by KP buy-ins. Split among closest-to-the-pin winners." }] : []),
            ...(results.gross_skins_separate_pot > 0 ? [{ label: "Gross Skins", value: results.gross_skins_separate_pot, tip: "Separate pot funded by gross skins buy-ins. Won by players with the lowest gross score on each hole." }] : []),
            ...(results.net_skins_separate_pot > 0 ? [{ label: "Net Skins", value: results.net_skins_separate_pot, tip: "Separate pot funded by net skins buy-ins. Won by players with the lowest net (handicap-adjusted) score on each hole." }] : []),
            ...(results.deuce_pot > 0 ? [{ label: "Deuce Pot", value: results.deuce_pot, tip: "Separate pot funded by deuce buy-ins. Split equally among players who made a 2 on a par-3." }] : []),
            { label: "Total Pot", value: results.total_pot, isTotal: true, tip: "Total tournament pot from all player buy-ins across all flights." },
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

        {/* Team or Individual standings */}
        <div className="mt-2">
          {round.game_type && round.game_type !== "individual" ? (
            <TeamStandings results={results} round={round} players={players} onEditScore={setEditingPlayer} editMode={editMode} holdMainPayouts={holdMainPayouts} />
          ) : (
            <GrossNetResults results={results} round={round} players={players} onEditScore={setEditingPlayer} editMode={editMode} holdMainPayouts={holdMainPayouts} isMultiFlight={isMultiFlight} />
          )}
        </div>

        {/* Field Prizes — Low Gross/Net of the Field (multi-flight tournament) */}
        {isMultiFlight && results?.is_series_cumulative && (results.field_gross_winner || results.field_net_winner) && (
          <div className="mt-2">
            <FieldPrizesCard results={results} />
          </div>
        )}

        {/* Final flight banner — makes it clear this page holds the combined
            final results for the entire multi-flight tournament. */}
        {isMultiFlight && isFinalFlight && !holdMainPayouts && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-primary/10 border border-primary/30 p-3">
            <Trophy className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-sm text-foreground leading-relaxed">
              <span className="font-semibold">{isHybrid ? 'Final Day of the Final Flight — Tournament Final Results' : 'Final Flight — Tournament Final Results'}</span>{" "}
              This page shows the combined Field Standings (all flights), each flight's own gross &amp; net winners, and the final payout table for the entire tournament.
            </p>
          </div>
        )}

        {/* Per-flight results (multi-flight tournament) — only on the final
            flight (and final day for hybrid), since all_flight_standings and
            field prizes are only computed then. Showing other flights' results
            on a non-final flight's page is confusing and potentially stale. */}
        {isMultiFlight && isFinalFlight && !holdMainPayouts && flightResultsList.length > 0 && (
          <div className="mt-2 space-y-3">
            <p className="text-sm font-bold text-foreground">Per-Flight Results</p>
            {flightResultsList.map(fr => (
              <FlightStandings key={fr.round.id} round={fr.round} results={fr.results} flightLabel={fr.flightLabel} payouts={results.payouts} holdMainPayouts={holdMainPayouts} placesCount={Math.max(results.gross_places?.length || 3, results.net_places?.length || 3)} />
            ))}
          </div>
        )}

        {/* Prior days' side games (multi-day series) */}
        {sideGameDays.map(d => (
          <SideGamesSection key={d.round.id} round={d.round} results={d.results} dayLabel={d.dayLabel} />
        ))}

        {/* Current day side games */}
        <SideGamesSection round={round} results={results} dayLabel={isMultiDay ? dayLabel : null} />

        {/* KPs enabled but no winners recorded (current round only) */}
        {round.kps_enabled && (round.kp_winners || []).filter(kp => kp.player_id).length === 0 && (
          <Card className="border-0 shadow-sm mt-4">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">KPs were enabled but no winners were recorded. Check the scorecard to add KP winners.</p>
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

        {/* Payout Table — per flight for multi-flight final results, combined otherwise */}
        {isMultiFlight && isFinalFlight && !holdMainPayouts && perFlightPayouts.length > 0 ? (
          perFlightPayouts.map(fp => (
            <div key={fp.flightLabel} className="mt-3 tour-results-payouts">
              <p className="text-sm font-bold text-foreground mb-1">{fp.flightLabel} — Final Payouts</p>
              <PayoutTable results={fp.flightResults} holdMainPayouts={holdMainPayouts} payoutDays={fp.flightPayoutDays} />
            </div>
          ))
        ) : (
          <div className="mt-3 tour-results-payouts">
            <PayoutTable results={results} holdMainPayouts={holdMainPayouts} payoutDays={isMultiFlight && !isHybrid ? [] : payoutDays} />
          </div>
        )}
        </motion.div>

        <SendResultsModal
          isOpen={sendModalOpen}
          onClose={() => setSendModalOpen(false)}
          round={round}
          results={results}
          dayLabel={dayLabel}
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