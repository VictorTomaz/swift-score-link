import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarClock, Shuffle, Check, Clock, Users, Save, UserPlus, Printer, Mail, FileText, ArrowLeft, Loader2 } from "lucide-react";
import { DragDropContext } from "@hello-pangea/dnd";
import { format } from "date-fns";
import { motion } from "framer-motion";
import PageDescription from "@/components/PageDescription";
import { toast } from "sonner";
import { canUseWindowPrint } from "@/lib/utils";
import { shareOrDownloadPdf } from "@/lib/fileShare";
import { generateTimeSlots, assignTeeTimes, ALGORITHMS } from "@/lib/teeSheetGenerator";
import SendTeeSheetModal from "@/components/teeSheet/SendTeeSheetModal";
import ScorecardHtmlPreview from "@/components/scorecard/ScorecardHtmlPreview";
import BlankScorecardPrintButton from "@/components/scorecard/BlankScorecardPrintButton";
import TeamGroups from "@/components/logistics/DraggableTeamGroups";
import DraggableTeeSheet from "@/components/logistics/DraggableTeeSheet";
import { Switch } from "@/components/ui/switch";

const DEFAULT_CONFIG = { start_time: "08:00", interval_minutes: 8, group_size: 4, extra_slots: 0 };

export default function TournamentLogistics() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();
  const [selectedRound, setSelectedRound] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [algorithm, setAlgorithm] = useState("pure_random");
  const [teamPairStyle, setTeamPairStyle] = useState("handicap_balanced");
  const [seedScoreType, setSeedScoreType] = useState("gross");
  const [isSaving, setIsSaving] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isGeneratingScorecards, setIsGeneratingScorecards] = useState(false);
  const [generatedScorecardPdfUrl, setGeneratedScorecardPdfUrl] = useState(null);
  const [scorecardPreviewUrl, setScorecardPreviewUrl] = useState(null);
  const [generatedTeeSheetPdfUrl, setGeneratedTeeSheetPdfUrl] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [groupTags, setGroupTags] = useState({});
  const [teamOrder, setTeamOrder] = useState(null);
  const [showEmailSelector, setShowEmailSelector] = useState(false);
  const [showTeeTimes, setShowTeeTimes] = useState(false);
  const [showScorecards, setShowScorecards] = useState(false);

  // Local config + assignments (mirrors round data)
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [assignments, setAssignments] = useState({}); // { player_id: "HH:MM" | null }

  const { data: rounds = [], isLoading } = useQuery({
    queryKey: ["rounds", user?.email],
    queryFn: () =>
      isAdmin
        ? base44.entities.Round.list("-created_date", 50)
        : base44.entities.Round.filter({ created_by: user?.email }, "-created_date", 50),
    enabled: !!user,
  });

  const players = selectedRound?.players || [];
  // A team-format round (scramble, best ball, 6-6-6, chapman, aggregate) uses
  // the team "Set Up Teams" flow — which auto-saves pairings — regardless of
  // the legacy team_mode flag, which the setup wizard doesn't set for team
  // game types. Without this, team rounds fall through to the individual
  // "Generate" button (no auto-save), so handicap-balanced teams never persist.
  const isTeamFormat = selectedRound?.team_mode || ['team_scramble', 'team_best_ball', 'team_6_6_6', 'team_chapman', 'team_aggregate'].includes(selectedRound?.game_type);

  // Players with pending (unsaved) group tags + tee times merged in, so the
  // scorecard preview reflects handicap-balanced team assignments immediately
  // instead of waiting for a Save.
  const previewPlayers = useMemo(
    () => players.map((p) => ({
      ...p,
      tee_group: groupTags[p.player_id] ?? p.tee_group ?? null,
      tee_time: assignments[p.player_id] ?? p.tee_time ?? null,
    })),
    [players, groupTags, assignments]
  );

  const scorecardGroups = useMemo(() => {
    if (!selectedRound) return [];
    const isTeamMode = selectedRound.team_mode === true || ['team_scramble', 'team_best_ball', 'team_6_6_6', 'team_chapman', 'team_aggregate'].includes(selectedRound.game_type);
    if (isTeamMode) {
      const teamSize = selectedRound?.team_size || 2;
      // 6-6-6: scorecard is per team (by tee_group tag), independent of tee time
      if (selectedRound.game_type === "team_6_6_6") {
        const tagged = {};
        const untagged = [];
        for (const p of previewPlayers) {
          const tag = (p.tee_group || "").trim();
          if (tag) {
            if (!tagged[tag]) tagged[tag] = [];
            tagged[tag].push(p);
          } else {
            untagged.push(p);
          }
        }
        const teams = Object.keys(tagged).sort().map((t) => tagged[t]);
        untagged.sort((a, b) => (a.tee_time || "").localeCompare(b.tee_time || ""));
        for (let i = 0; i < untagged.length; i += teamSize) {
          teams.push(untagged.slice(i, i + teamSize));
        }
        return teams.length ? teams : [previewPlayers];
      }
      // Other team formats: each team (by tee_group tag) gets its own scorecard.
      // Team membership is defined by the tag — NOT by tee time. Teammates
      // split across tee times still share one scorecard so they stay together.
      const hasGroupTags = previewPlayers.some(p => p && (p.tee_group || "").trim());
      if (hasGroupTags) {
        const tagged = {};
        const untagged = [];
        for (const p of previewPlayers) {
          const tag = (p.tee_group || "").trim();
          if (tag) {
            if (!tagged[tag]) tagged[tag] = [];
            tagged[tag].push(p);
          } else {
            untagged.push(p);
          }
        }
        const groups = Object.keys(tagged).sort().map((t) => tagged[t]);
        untagged.sort((a, b) => (a.tee_time || "").localeCompare(b.tee_time || ""));
        for (let i = 0; i < untagged.length; i += teamSize) {
          groups.push(untagged.slice(i, i + teamSize));
        }
        return groups.length ? groups : [previewPlayers];
      }
      // No group tags: group by tee time, then auto-split into teams of teamSize
      const teeTimeGroups = {};
      for (const p of previewPlayers) {
        const teeTime = (p.tee_time || "").trim() || "\u2014";
        if (!teeTimeGroups[teeTime]) teeTimeGroups[teeTime] = [];
        teeTimeGroups[teeTime].push(p);
      }
      const sortedKeys = Object.keys(teeTimeGroups).sort();
      let groups = sortedKeys.map((k) => teeTimeGroups[k]);
      if (groups.length === 0) groups.push(previewPlayers);
      if (teamSize > 0) {
        const split = [];
        for (const group of groups) {
          for (let i = 0; i < group.length; i += teamSize) {
            split.push(group.slice(i, i + teamSize));
          }
        }
        groups = split.length > 0 ? split : groups;
      }
      return groups;
    }
    // Non-team mode: group by tee_time
    const teeTimeGroups = {};
    for (const p of previewPlayers) {
      const teeTime = (p.tee_time || "").trim();
      if (teeTime) {
        if (!teeTimeGroups[teeTime]) teeTimeGroups[teeTime] = [];
        teeTimeGroups[teeTime].push(p);
      }
    }
    const sortedTimes = Object.keys(teeTimeGroups).sort();
    const groups = sortedTimes.map((t) => teeTimeGroups[t]);
    if (groups.length === 0) groups.push(previewPlayers);
    return groups;
  }, [selectedRound, previewPlayers]);

  // Group scorecards into print pages: 3 per page in team mode, 2 otherwise.
  // Used by both the on-screen preview and the portaled print container.
  const printPages = useMemo(() => {
    if (!scorecardGroups.length) return [];
    const perPage = 2;
    return scorecardGroups.reduce((pages, grp, i) => {
      if (i % perPage === 0) pages.push([]);
      pages[pages.length - 1].push(grp);
      return pages;
    }, []);
  }, [scorecardGroups, selectedRound?.team_mode]);

  const handleSelectRound = async (round) => {
    setSelectedRound(round);
    setGeneratedTeeSheetPdfUrl(null);
    setScorecardPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    const cfg = round.tee_sheet_config || DEFAULT_CONFIG;
    setConfig({
      start_time: cfg.start_time || "08:00",
      interval_minutes: cfg.interval_minutes || 8,
      group_size: cfg.group_size || 4,
      extra_slots: cfg.extra_slots || 0,
    });
    const a = {};
    const tags = {};
    (round.players || []).forEach((p) => {
      a[p.player_id] = p.tee_time || null;
      if (p.tee_group) tags[p.player_id] = p.tee_group;
    });
    setGroupTags(tags);
    setAssignments(a);
    setTeamOrder(null);
    setSelectedPlayerId(null);
    setHasChanges(false);
    // Auto-show the tee times section if this round already has saved tee times,
    // so the user doesn't have to click "Add Tee Times" again every time they
    // return to the page.
    const hasSavedTeeTimes = (round.players || []).some(p => p.tee_time);
    setShowTeeTimes(hasSavedTeeTimes);
  };

  const timeSlots = useMemo(() => {
    if (!players.length) return [];
    const interval = config.interval_minutes || 8;
    const groupSize = config.group_size || 4;
    if (selectedRound?.team_mode || ['team_scramble', 'team_best_ball', 'team_6_6_6', 'team_chapman', 'team_aggregate'].includes(selectedRound?.game_type)) {
      // Team format: size the tee sheet by team count so no team is ever split
      // across tee times (teams may go as a twosome rather than be broken up).
      const teamSize = selectedRound?.team_size || 2;
      const tagOf = (p) => (groupTags[p.player_id] || p.tee_group || '').trim();
      const groupCounts = {};
      players.forEach(p => { const tag = tagOf(p); if (tag) groupCounts[tag] = (groupCounts[tag] || 0) + 1; });
      const taggedTeams = Object.values(groupCounts).reduce((sum, count) => sum + Math.ceil(count / teamSize), 0);
      const untaggedCount = players.filter((p) => !tagOf(p)).length;
      const numTeams = taggedTeams + Math.ceil(untaggedCount / teamSize);
      const teamsPerSlot = Math.max(1, Math.floor(groupSize / teamSize));
      const extraSlots = Number(config.extra_slots) || 0;
      const numSlots = Math.ceil(numTeams / teamsPerSlot) + extraSlots;
      return generateTimeSlots(config.start_time, interval, numSlots * groupSize, groupSize);
    }
    const extraSlots = Number(config.extra_slots) || 0;
    return generateTimeSlots(config.start_time, interval, players.length + extraSlots * (groupSize || 4), groupSize);
  }, [config, players.length, selectedRound, groupTags]);

  // Track the previous set of tee time slot labels so we can remap existing
  // assignments when the user edits the start time / interval / group size /
  // extra slots. Without this, changing the start time shifts every slot
  // label (08:00 → 09:00) but assignments still reference the old labels,
  // so every player appears to "disappear" from the tee sheet.
  const prevTimeSlotsRef = useRef(timeSlots);
  const configChangedRef = useRef(false);

  useEffect(() => {
    const oldSlots = prevTimeSlotsRef.current;
    const newSlots = timeSlots;
    prevTimeSlotsRef.current = newSlots;

    // Only remap when the slot labels changed due to a user config edit
    // (not when loading a round or auto-assigning teams).
    if (!configChangedRef.current) return;
    configChangedRef.current = false;

    if (!oldSlots.length || !newSlots.length) return;
    const labelsChanged =
      oldSlots.length !== newSlots.length ||
      oldSlots.some((t, i) => t !== newSlots[i]);
    if (!labelsChanged) return;

    setAssignments((prev) => {
      const hasAssigned = Object.values(prev).some((t) => t);
      if (!hasAssigned) return prev;
      const next = {};
      for (const [playerId, time] of Object.entries(prev)) {
        if (!time) {
          next[playerId] = null;
        } else {
          const oldIdx = oldSlots.indexOf(time);
          if (oldIdx >= 0) {
            // Preserve slot position: slot 0 → new slot 0, etc.
            next[playerId] = newSlots[Math.min(oldIdx, newSlots.length - 1)];
          } else {
            next[playerId] = time;
          }
        }
      }
      return next;
    });
    setHasChanges(true);
  }, [timeSlots]);

  const unassignedPlayers = players.filter((p) => !assignments[p.player_id]);
  const slotsWithPlayers = timeSlots.map((time) => ({
    time,
    players: players.filter((p) => assignments[p.player_id] === time),
  }));

  const updateAssignment = useCallback(
    (playerId, time) => {
      setAssignments((prev) => {
        const next = { ...prev, [playerId]: time };
        return next;
      });
      setSelectedPlayerId(null);
      setHasChanges(true);
    },
    []
  );

  const handlePlayerTap = (playerId) => {
    if (selectedPlayerId === playerId) {
      updateAssignment(playerId, null);
    } else {
      setSelectedPlayerId(playerId);
    }
  };

  const handleSlotTap = (time) => {
    if (!selectedPlayerId) return;
    updateAssignment(selectedPlayerId, time);
  };

  const handleUnassignedTap = (playerId) => {
    if (selectedPlayerId === playerId) {
      setSelectedPlayerId(null);
    } else {
      setSelectedPlayerId(playerId);
    }
  };

  // Current display order of team tags (follows teamOrder if set, else alphabetical)
  const currentTeamOrder = useMemo(() => {
    const tags = new Set();
    players.forEach((p) => {
      const tag = (groupTags[p.player_id] || p.tee_group || "").trim();
      if (tag) tags.add(tag);
    });
    const allTags = [...tags];
    if (teamOrder) {
      const ordered = teamOrder.filter((t) => allTags.includes(t));
      const remaining = allTags.filter((t) => !teamOrder.includes(t)).sort();
      return [...ordered, ...remaining];
    }
    return allTags.sort();
  }, [players, groupTags, teamOrder]);

  // Single shared drag handler — routes tee-time drags (type="tee"),
  // team-group drags (type="team"), and team reordering (type="team-reorder")
  // from ONE DragDropContext.
  const handleDragEnd = (result) => {
    const { draggableId, destination, source, type } = result;
    if (!destination) return;
    if (type === "tee") {
      const newTime = destination.droppableId === "tee-unassigned" ? null : destination.droppableId;
      updateAssignment(draggableId, newTime);
      setHasChanges(true);
    } else if (type === "team") {
      const dest = destination.droppableId;
      if (dest === "team-unassigned") {
        setGroupTags((prev) => {
          const next = { ...prev };
          delete next[draggableId];
          return next;
        });
      } else {
        setGroupTags((prev) => ({ ...prev, [draggableId]: dest }));
      }
      setHasChanges(true);
    } else if (type === "tee-group") {
      // Dragging a whole team badge — move all players with that tag
      // to the destination tee time (or unassign if dropped on unassigned).
      const tag = draggableId.split("_")[1];
      if (!tag) return;
      const destId = destination.droppableId;
      const newTime = destId === "tee-group-unassigned" ? null : destId.replace("tee-group-", "");
      const newAssignments = { ...assignments };
      players.forEach((p) => {
        const pTag = (groupTags[p.player_id] || p.tee_group || "").trim();
        if (pTag === tag) {
          newAssignments[p.player_id] = newTime;
        }
      });
      setAssignments(newAssignments);
      setSelectedPlayerId(null);
      setHasChanges(true);
    } else if (type === "team-reorder") {
      if (!destination) return;
      const srcIdx = source.index;
      const dstIdx = destination.index;
      if (srcIdx === dstIdx) return;
      const newOrder = [...currentTeamOrder];
      const [moved] = newOrder.splice(srcIdx, 1);
      newOrder.splice(dstIdx, 0, moved);
      setTeamOrder(newOrder);
    }
  };

  const handleUnassignZoneTap = () => {
    if (!selectedPlayerId) return;
    updateAssignment(selectedPlayerId, null);
  };

  const handleSeedIndividualByScore = async () => {
    if (!selectedRound?.parent_round_id) {
      toast.error("Seed by Score needs a multi-day series — link this round to a Day 1 parent first.");
      return;
    }
    let parentRound;
    try {
      parentRound = await base44.entities.Round.get(selectedRound.parent_round_id);
    } catch (err) {
      toast.error("Could not load the parent round results.");
      return;
    }
    const pr = parentRound?.results;
    const seedType = seedScoreType === "gross" ? "gross" : "net";
    const indivResults = (seedType === "gross" ? pr?.gross_results : pr?.net_results) || [];
    if (!indivResults.length) {
      toast.error(`No ${seedType} scores found in the parent round — score Day 1 first.`);
      return;
    }
    const scoreOf = (r) => (seedType === "gross" ? r.gross_total : r.net_total) ?? 9999;
    const ranked = [...indivResults].filter((r) => !r.disqualified).sort((a, b) => scoreOf(a) - scoreOf(b));
    const rankById = {};
    ranked.forEach((r, i) => { rankById[r.player_id] = i; });
    // Worst first → earliest slots; best (leaders) → latest slots (go out last).
    const rosterRanked = [...players].sort((a, b) => (rankById[b.player_id] ?? 9999) - (rankById[a.player_id] ?? 9999));
    const groupSize = config.group_size || 4;
    const numSlots = Math.ceil(players.length / groupSize);
    const slots = generateTimeSlots(config.start_time, config.interval_minutes || 8, numSlots * groupSize, groupSize);
    const newAssignments = {};
    // Distribute players evenly so group sizes differ by at most 1, with the
    // SMALLER groups (3-somes) getting the earliest tee times and the larger
    // groups (4-somes) going out later. Worst players fill the earliest slots;
    // leaders go out last in full groups.
    // e.g. 21 players → 3,3,3,4,4,4 (not 4,4,4,3,3,3).
    const total = rosterRanked.length;
    const base = Math.floor(total / numSlots);
    const remainder = total % numSlots;
    let idx = 0;
    for (let s = 0; s < numSlots && idx < total; s++) {
      const groupLen = base + (s >= numSlots - remainder ? 1 : 0);
      const time = slots[s];
      for (let i = 0; i < groupLen && idx < total; i++) {
        newAssignments[rosterRanked[idx].player_id] = time;
        idx++;
      }
    }
    setAssignments(newAssignments);
    await persistAssignments(groupTags, newAssignments);
    const seeded = players.filter((p) => rankById[p.player_id] != null).length;
    toast.success(`Seeded ${seeded} player${seeded === 1 ? "" : "s"} by Day 1 ${seedType} score — leaders go out last`);
  };

  const handleGenerate = () => {
    if (!players.length) return;
    if (algorithm === 'seed_by_score') {
      handleSeedIndividualByScore();
      return;
    }
    const isTeamFormat = selectedRound?.team_mode || ['team_scramble', 'team_best_ball', 'team_6_6_6', 'team_chapman', 'team_aggregate'].includes(selectedRound?.game_type);
    const algo = algorithm;
    const taggedPlayers = players.map((p) => ({
      ...p,
      tee_group: (groupTags[p.player_id] || p.tee_group || '').trim(),
    }));
    let slots = timeSlots;
    if (isTeamFormat && algo === 'group_priority') {
      // Team format: pair any untagged players into teams so no singles slip
      // into a team's tee time and create a 3-some. Teams are never split.
      const teamSize = selectedRound?.team_size || 2;
      const groupSize = config.group_size || 4;
      const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const used = new Set(taggedPlayers.map((p) => p.tee_group).filter(Boolean));
      let li = 0;
      const nextLabel = () => {
        while (li < labels.length && used.has(labels[li])) li++;
        const lbl = li < labels.length ? labels[li++] : `T${li++ + 1}`;
        used.add(lbl);
        return lbl;
      };
      const untagged = taggedPlayers.filter((p) => !p.tee_group);
      const shuffled = [...untagged].sort(() => Math.random() - 0.5);
      const added = {};
      for (let i = 0; i < shuffled.length; i += teamSize) {
        const lbl = nextLabel();
        for (const p of shuffled.slice(i, i + teamSize)) {
          p.tee_group = lbl;
          added[p.player_id] = lbl;
        }
      }
      if (Object.keys(added).length) {
        setGroupTags((prev) => ({ ...prev, ...added }));
      }
      // Size the tee sheet by final team count so every team fits in one slot
      const gc = {};
      taggedPlayers.forEach(p => { if (p.tee_group) gc[p.tee_group] = (gc[p.tee_group] || 0) + 1; });
      const numTeams = Object.values(gc).reduce((sum, count) => sum + Math.ceil(count / teamSize), 0);
      const teamsPerSlot = Math.max(1, Math.floor(groupSize / teamSize));
      const numSlots = Math.ceil(numTeams / teamsPerSlot);
      slots = generateTimeSlots(config.start_time, config.interval_minutes || 8, numSlots * groupSize, groupSize);
    }
    const newAssignments = assignTeeTimes(taggedPlayers, slots, config.group_size || 4, algo);
    setAssignments(newAssignments);
    setSelectedPlayerId(null);
    setHasChanges(true);
    toast.success(`Tee times generated (${ALGORITHMS.find((a) => a.value === algo)?.label})`);
  };

  // Toggle the tee-time section on, and when first revealed auto-populate the
  // slots from the existing teams so the user immediately sees teams placed
  // in tee times instead of an empty grid. Does NOT re-pair teams — only
  // fills tee times based on current group tags.
  const handleToggleTeeTimes = async () => {
    const turningOn = !showTeeTimes;
    setShowTeeTimes(turningOn);
    if (!turningOn || !players.length) return;
    const hasAssignments = Object.values(assignments).some((t) => t);
    if (hasAssignments) return;
    if (isTeamFormat) {
      const hasTeams = players.some((p) => (groupTags[p.player_id] || p.tee_group || "").trim());
      if (!hasTeams) {
        // No teams yet — form balanced teams AND slot them in one step.
        await handleAutoAssignPairs();
        return;
      }
      const teamSize = selectedRound?.team_size || 2;
      const taggedPlayers = players.map((p) => ({
        ...p,
        tee_group: (groupTags[p.player_id] || p.tee_group || "").trim(),
      }));
      const groupSize = config.group_size || 4;
      const tagOf = (p) => (groupTags[p.player_id] || p.tee_group || "").trim();
      const groupCounts = {};
      taggedPlayers.forEach(p => { const tag = tagOf(p); if (tag) groupCounts[tag] = (groupCounts[tag] || 0) + 1; });
      const taggedTeams = Object.values(groupCounts).reduce((sum, count) => sum + Math.ceil(count / teamSize), 0);
      const untaggedCount = taggedPlayers.filter((p) => !tagOf(p)).length;
      const numTeams = taggedTeams + Math.ceil(untaggedCount / teamSize);
      const teamsPerSlot = Math.max(1, Math.floor(groupSize / teamSize));
      const numSlots = Math.ceil(numTeams / teamsPerSlot);
      const slots = generateTimeSlots(config.start_time, config.interval_minutes || 8, numSlots * groupSize, groupSize);
      const newAssignments = assignTeeTimes(taggedPlayers, slots, groupSize, "group_priority");
      setAssignments(newAssignments);
      try {
        await persistAssignments(groupTags, newAssignments);
        toast.success("Tee times auto-filled from teams");
      } catch (e) { /* persistAssignments toasts the error */ }
    } else {
      // Non-team format: if the user already has group tags set up (e.g.
      // Groups A–G from the Teams panel), use Group Priority so those
      // groups stay together in tee times instead of shuffling randomly.
      const hasGroupTags = players.some((p) =>
        (groupTags[p.player_id] || p.tee_group || "").trim()
      );
      if (hasGroupTags) {
        setAlgorithm("group_priority");
        const taggedPlayers = players.map((p) => ({
          ...p,
          tee_group: (groupTags[p.player_id] || p.tee_group || "").trim(),
        }));
        const groupSize = config.group_size || 4;
        const slots = generateTimeSlots(
          config.start_time,
          config.interval_minutes || 8,
          players.length,
          groupSize
        );
        const newAssignments = assignTeeTimes(taggedPlayers, slots, groupSize, "group_priority");
        setAssignments(newAssignments);
        try {
          await persistAssignments(groupTags, newAssignments);
          toast.success("Tee times auto-filled from groups");
        } catch (e) { /* persistAssignments toasts the error */ }
      } else {
        handleGenerate();
      }
    }
  };

  const handleConfigChange = (field, value) => {
    configChangedRef.current = true;
    setConfig((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handlePrint = async () => {
    if (!selectedRound) {
      toast.error("Select a round first");
      return;
    }
    if (!slotsWithPlayers.length) {
      toast.error("Assign at least one player to a tee time first");
      return;
    }
    setIsPrinting(true);
    setGeneratedTeeSheetPdfUrl(null);
    try {
      if (hasChanges) {
        const updatedPlayers = players.map((p) => ({
          ...p,
          tee_time: assignments[p.player_id] || null,
        }));
        await base44.entities.Round.update(selectedRound.id, {
          players: updatedPlayers,
          tee_sheet_config: config,
        });
        queryClient.setQueryData(["rounds", user?.email], (old = []) =>
          old.map((r) =>
            r.id === selectedRound.id
              ? { ...r, players: updatedPlayers, tee_sheet_config: config }
              : r
          )
        );
        setSelectedRound((prev) => prev ? { ...prev, players: updatedPlayers, tee_sheet_config: config } : prev);
        setHasChanges(false);
      }
      const res = await base44.functions.invoke("generateTeeSheetPdf", { roundId: selectedRound.id, _cb: Date.now() });
      const { url, filename } = res.data;
      if (!url) throw new Error('No URL returned from server');
      await shareOrDownloadPdf(url, filename || `tee-sheet-${selectedRound.event_name || 'golf'}.pdf`);
      toast.success('Tee sheet ready — use the share sheet to print or save.');
    } catch (error) {
      toast.error("Failed to generate tee sheet PDF: " + (error.message || "unknown error"));
    } finally {
      setIsPrinting(false);
    }
  };

  const handleEmailToMe = () => {
    if (!selectedRound) {
      toast.error("No round selected");
      return;
    }
    if (hasChanges) {
      toast.error("Please save your tee sheet before emailing.");
      return;
    }
    if (!slotsWithPlayers.length) {
      toast.error("No players assigned to tee times");
      return;
    }
    setShowEmailSelector(true);
  };

  // Persist team tags + tee times to the round so auto-assigned pairings stick
  // immediately without requiring a separate Save click.
  const persistAssignments = async (tags, newAssignments, extraFields = {}) => {
    if (!selectedRound) return;
    const updatedPlayers = players.map((p) => ({
      ...p,
      tee_time: newAssignments[p.player_id] || null,
      tee_group: tags[p.player_id] || null,
    }));
    // Coerce numeric config fields — the interval/group inputs can hold '' when
    // cleared, and saving a string into a number-typed tee_sheet_config field
    // fails validation, rejecting the whole update (so team tags never persist).
    const safeConfig = {
      ...config,
      interval_minutes: Number(config.interval_minutes) || 8,
      group_size: Number(config.group_size) || 4,
      extra_slots: Number(config.extra_slots) || 0,
    };
    // Save team_mode/team_size atomically WITH the players so the round is
    // never left half-configured (team_mode on, but no team tags persisted).
    const payload = {
      players: updatedPlayers,
      tee_sheet_config: safeConfig,
      ...extraFields,
    };
    try {
      await base44.entities.Round.update(selectedRound.id, payload);
      queryClient.setQueryData(["rounds", user?.email], (old = []) =>
        old.map((r) =>
          r.id === selectedRound.id
            ? { ...r, ...payload }
            : r
        )
      );
      // Keep the Scorecard's single-round cache in sync too — otherwise it
      // holds stale no-tag players and the next Scorecard save (Lock Roster /
      // Edit Roster) overwrites the tags we just persisted.
      queryClient.setQueryData(["round", selectedRound.id], (old) => old ? { ...old, ...payload } : old);
      setSelectedRound((prev) => prev ? { ...prev, ...payload } : prev);
      setHasChanges(false);
    } catch (err) {
      toast.error("Failed to save team assignments");
      throw err;
    }
  };

  const handleSave = async () => {
    if (!selectedRound) return;
    setIsSaving(true);
    try {
      await persistAssignments(groupTags, assignments);
      toast.success("Tee sheet saved");
    } catch (err) {
      // persistAssignments already toasts the specific failure — re-thrown so
      // we don't falsely report "Tee sheet saved" when nothing persisted.
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadScorecardPdf = async () => {
    if (!selectedRound) return;
    // Auto-save tee times before generating scorecards
    if (hasChanges) {
      setIsSaving(true);
      try {
        const updatedPlayers = players.map((p) => ({
          ...p,
          tee_time: assignments[p.player_id] || null,
          tee_group: groupTags[p.player_id] || null,
        }));
        await base44.entities.Round.update(selectedRound.id, {
          players: updatedPlayers,
          tee_sheet_config: config,
        });
        queryClient.setQueryData(["rounds", user?.email], (old = []) =>
          old.map((r) =>
            r.id === selectedRound.id
              ? { ...r, players: updatedPlayers, tee_sheet_config: config }
              : r
          )
        );
        setSelectedRound((prev) => prev ? { ...prev, players: updatedPlayers, tee_sheet_config: config } : prev);
        setHasChanges(false);
      } catch (err) {
        toast.error('Failed to save tee sheet');
        setIsSaving(false);
        return;
      } finally {
        setIsSaving(false);
      }
    }
    setIsGeneratingScorecards(true);
    try {
      const screenPlayers = players.map((p) => ({
        ...p,
        tee_time: assignments[p.player_id] || null,
        tee_group: groupTags[p.player_id] || null,
      }));
      const res = await base44.functions.invoke("generateScorecardPdf", { roundId: selectedRound.id, players: screenPlayers, _cb: Date.now() });
      const { url, filename } = res.data || {};
      if (!url) throw new Error('No URL returned from server');
      // Download the fresh PDF via blob + download attribute so iOS Safari's
      // PDF viewer never opens — no viewer tab means no stale-render cache.
      const blobRes = await fetch(url);
      const blob = await blobRes.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || `scorecards-${selectedRound.event_name || 'golf'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      toast.success('Scorecard PDF downloaded!');
    } catch (error) {
      toast.error('Failed to download scorecard PDF: ' + (error.message || 'unknown error'));
    } finally {
      setIsGeneratingScorecards(false);
    }
  };

  const handlePrintScorecards = async () => {
    if (!selectedRound || !players.length || scorecardGroups.length === 0) {
      toast.error('No players assigned to tee times');
      return;
    }
    // Save pending tee times so the printed cards reflect current assignments.
    if (hasChanges) {
      setIsSaving(true);
      try {
        const updatedPlayers = players.map((p) => ({
          ...p,
          tee_time: assignments[p.player_id] || null,
          tee_group: groupTags[p.player_id] || null,
        }));
        await base44.entities.Round.update(selectedRound.id, {
          players: updatedPlayers,
          tee_sheet_config: config,
        });
        queryClient.setQueryData(['rounds', user?.email], (old = []) =>
          old.map((r) =>
            r.id === selectedRound.id
              ? { ...r, players: updatedPlayers, tee_sheet_config: config }
              : r
          )
        );
        setSelectedRound((prev) => prev ? { ...prev, players: updatedPlayers, tee_sheet_config: config } : prev);
        setHasChanges(false);
      } catch (err) {
        toast.error('Failed to save tee sheet');
        setIsSaving(false);
        return;
      } finally {
        setIsSaving(false);
      }
    }
    // Browser: print the on-page HTML scorecards (always live data, never a
    // stale PDF). Native app webview: window.print() is a no-op, so generate
    // a scorecard PDF and open it for share/print via the OS sheet.
    if (canUseWindowPrint()) {
      window.print();
      return;
    }
    setIsGeneratingScorecards(true);
    try {
      const screenPlayers = players.map((p) => ({
        ...p,
        tee_time: assignments[p.player_id] || null,
        tee_group: groupTags[p.player_id] || null,
      }));
      const res = await base44.functions.invoke("generateScorecardPdf", { roundId: selectedRound.id, players: screenPlayers, _cb: Date.now() });
      const { url, filename } = res.data || {};
      if (!url) throw new Error('No URL returned from server');
      await shareOrDownloadPdf(url, filename || `scorecards-${selectedRound.event_name || 'golf'}.pdf`);
      toast.success('Scorecards ready — use the share sheet to print or save.');
    } catch (error) {
      toast.error('Failed to generate scorecard PDF: ' + (error.message || 'unknown error'));
    } finally {
      setIsGeneratingScorecards(false);
    }
  };

  const handleToggleTeamMode = async (checked) => {
    if (!selectedRound) return;
    await base44.entities.Round.update(selectedRound.id, { team_mode: checked });
    setSelectedRound((prev) => prev ? { ...prev, team_mode: checked } : prev);
    queryClient.setQueryData(["rounds", user?.email], (old = []) =>
      old.map((r) => r.id === selectedRound.id ? { ...r, team_mode: checked } : r)
    );
    toast.success(checked ? "Team scorecard mode enabled" : "Standard scorecard mode");
  };

  const handleTeamFormatChange = async (format) => {
    if (!selectedRound) return;
    await base44.entities.Round.update(selectedRound.id, { team_format: format });
    setSelectedRound((prev) => prev ? { ...prev, team_format: format } : prev);
    queryClient.setQueryData(["rounds", user?.email], (old = []) =>
      old.map((r) => r.id === selectedRound.id ? { ...r, team_format: format } : r)
    );
  };

  const handleTeamSizeChange = async (size) => {
    if (!selectedRound) return;
    await base44.entities.Round.update(selectedRound.id, { team_size: size });
    setSelectedRound((prev) => prev ? { ...prev, team_size: size } : prev);
    queryClient.setQueryData(["rounds", user?.email], (old = []) =>
      old.map((r) => r.id === selectedRound.id ? { ...r, team_size: size } : r)
    );
  };

  const handleGameTypeChange = async (gameType) => {
    if (!selectedRound) return;
    const isTeam = gameType !== 'individual';
    const updates = { game_type: gameType };
    if (selectedRound.team_mode !== isTeam) updates.team_mode = isTeam;
    // Chapman and 6-6-6 always use the scramble scorecard layout — lock it in
    if (['team_chapman', 'team_6_6_6'].includes(gameType)) updates.team_format = 'scramble';
    await base44.entities.Round.update(selectedRound.id, updates);
    setSelectedRound((prev) => prev ? { ...prev, ...updates } : prev);
    queryClient.setQueryData(["rounds", user?.email], (old = []) =>
      old.map((r) => r.id === selectedRound.id ? { ...r, ...updates } : r)
    );
  };

  const handleHcpFormulaChange = async (formula) => {
    if (!selectedRound) return;
    await base44.entities.Round.update(selectedRound.id, { hcp_formula: formula });
    setSelectedRound((prev) => prev ? { ...prev, hcp_formula: formula } : prev);
    queryClient.setQueryData(["rounds", user?.email], (old = []) =>
      old.map((r) => r.id === selectedRound.id ? { ...r, hcp_formula: formula } : r)
    );
  };

  const handleAutoAssignPairs = async () => {
    if (!selectedRound || !players.length) return;
    const teamSize = selectedRound.team_size || 2;
    // Validate Seed by Score up front (before any save) so we never leave the
    // round half-configured with team_mode on but no team tags persisted.
    if (teamPairStyle === "seed_by_score" && !selectedRound.parent_round_id) {
      toast.error("Seed by Score needs a multi-day series — link this round to a Day 1 parent first.");
      return;
    }
    // team_mode / team_size are saved atomically WITH the players in the
    // persistAssignments call below (not in a separate earlier update), so the
    // round can't end up with team_mode enabled but no team tags written.
    const updates = {};
    if (!selectedRound.team_mode) updates.team_mode = true;
    if (selectedRound.team_size !== teamSize) updates.team_size = teamSize;
    // 1) Pair all players into complete teams. When 'Handicap Balanced' is the
    //    selected tee-time algorithm, build teams via a greedy best-fit: sort
    //    by effective handicap (strongest first) and place each player into
    //    the team with the lowest current combined handicap. This keeps team
    //    handicaps tight even with outliers or odd counts. Otherwise pair
    //    consecutive players in roster order. No 1-man teams are created from
    //    odd-count slots — the count stays accurate (floor(players / teamSize)).
    const numPlayers = players.length;
    const numTeams = Math.floor(numPlayers / teamSize);
    // Effective handicap: plus-handicap players are better than scratch, so
    // treat them as negative so they sort to the top.
    const effHcp = (p) => {
      const h = p.course_handicap ?? p.handicap ?? 0;
      return p.is_plus_handicap ? -Math.abs(h) : h;
    };
    const tagLabels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

    // Seed by Score: pull the parent (Day 1) round's team standings and send
    // the leaders out last. Existing tee_group tags are preserved — only tee
    // times are assigned. Requires a multi-day child round with a scored parent.
    if (teamPairStyle === "seed_by_score") {
      let parentRound;
      try {
        parentRound = await base44.entities.Round.get(selectedRound.parent_round_id);
      } catch (err) {
        toast.error("Could not load the parent round results.");
        return;
      }
      const pr = parentRound?.results;
      const seedType = seedScoreType === "gross" ? "gross" : "net";
      const teamResults = (seedType === "gross" ? pr?.team_gross_results : pr?.team_net_results) || [];
      if (!teamResults.length) {
        toast.error(`No ${seedType} team scores found in the parent round — score Day 1 first.`);
        return;
      }
      const tagOf = (p) => (groupTags[p.player_id] || p.tee_group || "").trim();
      const teamPlayers = {};
      const untagged = [];
      players.forEach((p) => {
        const tag = tagOf(p);
        if (tag) {
          if (!teamPlayers[tag]) teamPlayers[tag] = [];
          teamPlayers[tag].push(p);
        } else {
          untagged.push(p);
        }
      });
      // Best (lowest score) → worst, using the selected gross/net standings.
      const scoreOf = (t) => (seedType === "gross" ? t.best_ball_gross : t.best_ball_net) ?? 9999;
      const ranked = [...teamResults]
        .filter((t) => !t.disqualified)
        .sort((a, b) => scoreOf(a) - scoreOf(b));
      // Ranked teams present in this roster, then any untagged-roster teams (no score → worst).
      const orderedTeamIds = ranked.map((t) => t.team_id).filter((id) => teamPlayers[id]);
      Object.keys(teamPlayers)
        .sort()
        .forEach((id) => { if (!orderedTeamIds.includes(id)) orderedTeamIds.push(id); });

      const teamSize = selectedRound.team_size || 2;
      const groupSize = config.group_size || 4;
      const teamsPerSlot = Math.max(1, Math.floor(groupSize / teamSize));
      // Untagged players form extra teams (counted as worst — go out first).
      const extraTeams = Math.ceil(untagged.length / teamSize);
      const totalTeams = orderedTeamIds.length + extraTeams;
      const numSlots = Math.ceil(totalTeams / teamsPerSlot);
      const slots = generateTimeSlots(config.start_time, config.interval_minutes || 8, numSlots * groupSize, groupSize);

      const newAssignments = {};
      // Fill from the LAST slot backwards so leaders go out last.
      let slotIdx = slots.length - 1;
      let placedInSlot = 0;
      for (const teamId of orderedTeamIds) {
        const time = slots[Math.max(0, slotIdx)];
        teamPlayers[teamId].forEach((p) => { newAssignments[p.player_id] = time; });
        placedInSlot++;
        if (placedInSlot >= teamsPerSlot) { placedInSlot = 0; slotIdx--; }
      }
      // Untagged players: fill the earliest slots (worst — go out first).
      let earlySlot = 0;
      let earlyCount = 0;
      for (let i = 0; i < untagged.length; i += teamSize) {
        const chunk = untagged.slice(i, i + teamSize);
        const time = slots[earlySlot];
        chunk.forEach((p) => { newAssignments[p.player_id] = time; });
        earlyCount++;
        if (earlyCount >= teamsPerSlot) { earlyCount = 0; earlySlot++; }
      }
      setAssignments(newAssignments);
      await persistAssignments(groupTags, newAssignments, updates);
      toast.success(`Seeded ${orderedTeamIds.length} team${orderedTeamIds.length === 1 ? "" : "s"} by Day 1 ${seedType} score — leaders go out last`);
      return;
    }

    // Group Priority: honor existing group tags and only fill gaps / form new
    // teams from untagged players. Computed directly (not via teamOrder) so
    // previously-assigned tags are preserved.
    if (teamPairStyle === "group_priority") {
      const tagged = {};
      const untagged = [];
      players.forEach((p) => {
        const tag = (groupTags[p.player_id] || p.tee_group || "").trim();
        if (tag) {
          if (!tagged[tag]) tagged[tag] = [];
          tagged[tag].push(p);
        } else {
          untagged.push(p);
        }
      });
      const gpTags = {};
      const teamLists = Object.keys(tagged).sort().map((tag) => ({ tag, members: [...tagged[tag]] }));
      for (const t of teamLists) for (const p of t.members) gpTags[p.player_id] = t.tag;
      for (const t of teamLists) {
        while (t.members.length < teamSize && untagged.length > 0) {
          const p = untagged.shift();
          t.members.push(p);
          gpTags[p.player_id] = t.tag;
        }
      }
      const used = new Set(Object.keys(tagged));
      let li = 0;
      const nextLabel = () => {
        while (li < tagLabels.length && used.has(tagLabels[li])) li++;
        const lbl = li < tagLabels.length ? tagLabels[li] : `T${li + 1}`;
        used.add(lbl);
        return lbl;
      };
      let newTeamCount = 0;
      while (untagged.length >= teamSize) {
        const lbl = nextLabel();
        for (const p of untagged.splice(0, teamSize)) gpTags[p.player_id] = lbl;
        newTeamCount++;
      }
      const complete = teamLists.filter((t) => t.members.length === teamSize).length + newTeamCount;
      const leftover = untagged.length;
      setGroupTags(gpTags);
      const taggedPlayers = players.map((p) => ({ ...p, tee_group: gpTags[p.player_id] || "" }));
      const groupSize = config.group_size || 4;
      const totalTeams = teamLists.length + newTeamCount;
      const teamsPerSlot = Math.max(1, Math.floor(groupSize / teamSize));
      const numSlots = Math.ceil(totalTeams / teamsPerSlot);
      const slots = generateTimeSlots(config.start_time, config.interval_minutes || 8, numSlots * groupSize, groupSize);
      const newAssignments = assignTeeTimes(taggedPlayers, slots, groupSize, "group_priority");
      setAssignments(newAssignments);
      await persistAssignments(gpTags, newAssignments, updates);
      toast.success(`Auto-assigned ${complete} ${teamSize}-man teams (group priority)${leftover ? ` (${leftover} player left over)` : ""}`);
      return;
    }

    let teamOrder;
    if (numTeams > 0) {
      if (teamPairStyle === "handicap_balanced") {
        // Greedy LPT: place the highest-handicap player into the team with the
        // lowest current combined handicap. Then locally swap players between
        // teams wherever it shrinks the spread (max − min) of team totals, so
        // every team's handicap total ends up as close to the others as the
        // roster allows.
        const sorted = [...players].sort((a, b) => effHcp(b) - effHcp(a));
        const teams = Array.from({ length: numTeams }, () => []);
        const sums = new Array(numTeams).fill(0);
        sorted.slice(0, numTeams * teamSize).forEach((p) => {
          let best = -1;
          let bestSum = Infinity;
          for (let i = 0; i < numTeams; i++) {
            if (teams[i].length >= teamSize) continue;
            if (sums[i] < bestSum) {
              bestSum = sums[i];
              best = i;
            }
          }
          if (best === -1) best = 0;
          teams[best].push(p);
          sums[best] += effHcp(p);
        });
        // Local-search swaps: reduce the spread of team totals until stable.
        const spreadOf = () => Math.max(...sums) - Math.min(...sums);
        let improved = true;
        let passes = 0;
        while (improved && passes < 50 && spreadOf() > 0) {
          improved = false;
          passes++;
          for (let i = 0; i < numTeams; i++) {
            for (let j = i + 1; j < numTeams; j++) {
              for (let a = 0; a < teams[i].length; a++) {
                for (let b = 0; b < teams[j].length; b++) {
                  const spread = spreadOf();
                  if (spread === 0) break;
                  const va = effHcp(teams[i][a]);
                  const vb = effHcp(teams[j][b]);
                  const newSumI = sums[i] - va + vb;
                  const newSumJ = sums[j] - vb + va;
                  let newMax = Math.max(newSumI, newSumJ);
                  let newMin = Math.min(newSumI, newSumJ);
                  for (let k = 0; k < numTeams; k++) {
                    if (k === i || k === j) continue;
                    if (sums[k] > newMax) newMax = sums[k];
                    if (sums[k] < newMin) newMin = sums[k];
                  }
                  if (newMax - newMin < spread) {
                    const tmp = teams[i][a];
                    teams[i][a] = teams[j][b];
                    teams[j][b] = tmp;
                    sums[i] = newSumI;
                    sums[j] = newSumJ;
                    improved = true;
                  }
                }
              }
            }
          }
        }
        teamOrder = teams.flat();
      } else if (teamPairStyle === "pure_random") {
        // Shuffle everyone, then pair consecutive players into teams.
        const shuffled = [...players].sort(() => Math.random() - 0.5);
        teamOrder = shuffled.slice(0, numTeams * teamSize);
      } else if (teamPairStyle === "handicap_grouped") {
        // Pair similar handicaps together (strong-with-strong, weak-with-weak).
        const sorted = [...players].sort((a, b) => effHcp(b) - effHcp(a));
        teamOrder = sorted.slice(0, numTeams * teamSize);
      } else if (teamPairStyle === "diversified") {
        // Snake draft: sort by handicap, distribute across teams so each gets
        // a mix of strong and weak players (alternating direction each round).
        const sorted = [...players].sort((a, b) => effHcp(b) - effHcp(a));
        const teams = Array.from({ length: numTeams }, () => []);
        sorted.slice(0, numTeams * teamSize).forEach((p, i) => {
          const cycle = Math.floor(i / numTeams);
          const pos = i % numTeams;
          const idx = cycle % 2 === 0 ? pos : numTeams - 1 - pos;
          teams[idx].push(p);
        });
        teamOrder = teams.flat();
      } else {
        // Sequential: keep roster order, pair consecutive players.
        teamOrder = players.slice(0, numTeams * teamSize);
      }
    } else {
      teamOrder = players;
    }
    const newTags = {};
    let pairIdx = 0;
    for (let i = 0; i < teamOrder.length; i += teamSize) {
      const tag = tagLabels[pairIdx] || `T${pairIdx + 1}`;
      pairIdx++;
      for (const p of teamOrder.slice(i, i + teamSize)) {
        newTags[p.player_id] = tag;
      }
    }
    setGroupTags(newTags);
    // 2) Generate tee times grouped by team so each slot contains whole teams
    //    (twosomes/foursomes only — no 3-somes), keeping tee groups and teams aligned.
    const taggedPlayers = players.map((p) => ({ ...p, tee_group: newTags[p.player_id] || "" }));
    const groupSize = config.group_size || 4;
    const teamsPerSlot = Math.max(1, Math.floor(groupSize / teamSize));
    const numSlots = Math.ceil(pairIdx / teamsPerSlot);
    const slots = generateTimeSlots(config.start_time, config.interval_minutes || 8, numSlots * groupSize, groupSize);
    const newAssignments = assignTeeTimes(taggedPlayers, slots, groupSize, "group_priority");
    setAssignments(newAssignments);
    await persistAssignments(newTags, newAssignments, updates);
    const complete = Math.floor(players.length / teamSize);
    const leftover = players.length % teamSize;
    const styleLabels = {
      handicap_balanced: "handicap-balanced",
      pure_random: "random",
      sequential: "sequential",
      handicap_grouped: "handicap-grouped",
      diversified: "diversified",
      seed_by_score: "seeded by score",
    };
    const styleLabel = styleLabels[teamPairStyle] || teamPairStyle;
    toast.success(`Auto-assigned ${complete} ${teamSize}-man teams (${styleLabel})${leftover ? ` (${leftover} player left over)` : ""}`);
  };

  const hasTeeTimesAssigned = slotsWithPlayers.some(slot => slot.players.length > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-6 pb-20 sm:pb-0"
    >
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/Settings')} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Settings
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const id = selectedRound?.id || sessionStorage.getItem("lastRoundId");
            navigate(id ? `/Scorecard?id=${id}&scrollTo=lockRoster` : '/Scorecard');
          }}
          className="gap-2"
        >
          Back to Locking in Roster and Entering Scores
        </Button>
      </div>
      <PageDescription
        title="Tournament Logistics"
        description="Assign tee times and group tags, then generate scorecards or tee sheets."
      />

      {/* Round selector */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Select a Round</h2>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : rounds.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No rounds found. Create a round first.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {rounds.map((round) => (
                <button
                  key={round.id}
                  onClick={() => handleSelectRound(round)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${
                    selectedRound?.id === round.id
                      ? "border-primary bg-primary/5"
                      : "border-border bg-muted/50 hover:bg-muted"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{round.event_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {round.course_name || "No course"} · {round.player_count} players
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0 ml-2">
                    {round.date ? format(new Date(round.date.replace(/-/g, "/")), "MMM d, yyyy") : ""}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedRound && (
        <>
          {/* Toggle buttons for optional tee times and scorecard sections */}
          <div className="flex gap-2">
            <Button
              variant={showTeeTimes ? "default" : "outline"}
              size="default"
              onClick={handleToggleTeeTimes}
              className="gap-1.5 flex-1 bg-logistics text-logistics-foreground hover:bg-logistics/90"
            >
              <CalendarClock className="w-4 h-4" />
              {showTeeTimes ? "Hide Tee Times" : "Add Tee Times"}
            </Button>
            <Button
              variant="default"
              size="default"
              onClick={() => setShowScorecards(!showScorecards)}
              className="gap-1.5 flex-1 bg-logistics text-logistics-foreground hover:bg-logistics/90"
            >
              <FileText className="w-4 h-4" />
              {showScorecards ? "Hide Scorecards" : "Add Scorecards"}
            </Button>
          </div>

          {/* Team Setup + Scorecard config */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Users className="w-4 h-4" /> Team Setup
              </h3>
              <p className="text-xs text-muted-foreground">Configure teams and assign group tags. Toggle Tee Times or Scorecards above if needed.</p>
              <div className="flex items-center justify-between gap-2 py-2 border-y border-border">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Team Scorecard (Gross + Net rows)
                </label>
                <Switch
                  checked={!!selectedRound?.team_mode}
                  onCheckedChange={handleToggleTeamMode}
                  disabled={!selectedRound}
                />
              </div>
              {selectedRound?.team_mode && (
                <div className="flex items-center gap-2 py-1">
                  <label className="text-xs font-medium text-muted-foreground">Team size:</label>
                  <div className="flex gap-1">
                    {[2, 3, 4].map((n) => (
                      <button
                        key={n}
                        onClick={() => handleTeamSizeChange(n)}
                        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                          (selectedRound?.team_size || 2) === n
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground hover:bg-muted/80"
                        }`}
                      >
                        {n}P
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {selectedRound?.team_mode && (() => {
                const scrambleOnly = ['team_chapman', 'team_6_6_6'].includes(selectedRound?.game_type);
                return (
                  <div className="flex items-center gap-2 py-1">
                    <label className="text-xs font-medium text-muted-foreground">Format:</label>
                    <div className="flex gap-1">
                      <button
                        onClick={() => !scrambleOnly && handleTeamFormatChange("best_ball")}
                        disabled={scrambleOnly}
                        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                          scrambleOnly
                            ? "bg-muted/40 text-muted-foreground/40 cursor-not-allowed"
                            : (selectedRound?.team_format || "best_ball") === "best_ball"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground hover:bg-muted/80"
                        }`}
                      >
                        Best Ball
                      </button>
                      <button
                        onClick={() => handleTeamFormatChange("scramble")}
                        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                          selectedRound?.team_format === "scramble"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground hover:bg-muted/80"
                        }`}
                      >
                        Scramble
                      </button>
                    </div>
                  </div>
                );
              })()}
              <div className="flex items-center gap-2 py-1">
                <label className="text-xs font-medium text-muted-foreground">Game Type:</label>
                <select
                  value={selectedRound?.game_type || "individual"}
                  onChange={(e) => handleGameTypeChange(e.target.value)}
                  disabled={!selectedRound}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="individual">Individual</option>
                  <option value="team_scramble">Team Scramble</option>
                  <option value="team_best_ball">Team Best Ball</option>
                  <option value="team_6_6_6">6-6-6</option>
                  <option value="team_chapman">Chapman</option>
                  <option value="team_aggregate">Team Aggregate</option>
                </select>
              </div>
              {selectedRound?.game_type && selectedRound.game_type !== "individual" && (
                <div className="flex items-center gap-2 py-1">
                  <label className="text-xs font-medium text-muted-foreground">Handicap Formula:</label>
                  <select
                    value={selectedRound?.hcp_formula || "combined_85"}
                    onChange={(e) => handleHcpFormulaChange(e.target.value)}
                    disabled={!selectedRound}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="none">No Handicap</option>
                    <option value="combined_avg">Combined Average</option>
                    <option value="avg_30">70% of Combined Average</option>
                    <option value="combined_85">85% of Combined</option>
                    <option value="usga_scramble">USGA Scramble (25% Low / 15% High)</option>
                    <option value="sum">Full Combined (Sum)</option>
                  </select>
                </div>
              )}
              {selectedRound?.team_mode && (
                <p className="text-xs text-muted-foreground">
                  Tip: Assign different group tags (e.g. A, B) to players on the same tee time — each tag becomes a separate team on the scorecard.
                </p>
              )}
              {showScorecards && (
                <>
              <Button
                size="sm"
                variant="secondary"
                onClick={handlePrintScorecards}
                disabled={!players.length || scorecardGroups.length === 0 || isGeneratingScorecards}
                className="gap-2 w-full bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {isGeneratingScorecards ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                {isGeneratingScorecards ? "Generating…" : "Print Scorecards"}
              </Button>
              <BlankScorecardPrintButton round={selectedRound} className="w-full" />
              {selectedRound?.team_mode && (
                <div className="pt-2 border-t border-border space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Scorecard layout: <span className="font-medium text-foreground">
                      {selectedRound?.game_type === 'team_6_6_6' ? '6-6-6' : selectedRound?.game_type === 'team_chapman' ? 'Chapman' : selectedRound?.game_type === 'team_aggregate' ? 'Aggregate' : (selectedRound?.team_format || 'best_ball') === 'best_ball' ? 'Best Ball' : 'Scramble'}
                    </span> · {selectedRound?.team_size || 2}-man teams
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Each team gets its own {selectedRound?.game_type === 'team_6_6_6' ? '6-6-6 segment' : 'Gross/Net best-ball'} row on the scorecard.
                  </p>
                </div>
              )}
              {scorecardPreviewUrl && (
                <div className="rounded-lg border border-border overflow-hidden bg-muted/30">
                  <iframe
                    key={scorecardPreviewUrl}
                    src={scorecardPreviewUrl}
                    title="Scorecard PDF preview"
                    className="w-full"
                    style={{ height: '70vh' }}
                    sandbox="allow-same-origin"
                  />
                </div>
              )}
              {players.length > 0 && printPages.length > 0 && (
                <div className="space-y-4">
                  {printPages.map((pageGroups, pi) => (
                    <div key={pi} className="space-y-4">
                      {pageGroups.map((grp, gi) => (
                        <ScorecardHtmlPreview key={gi} round={selectedRound} group={grp} />
                      ))}
                    </div>
                  ))}
                </div>
              )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Config + Generate */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Users className="w-4 h-4" /> Team Pairing
              </h3>
              {showTeeTimes && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Start
                    </label>
                    <input
                      type="time"
                      value={config.start_time}
                      onChange={(e) => handleConfigChange("start_time", e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Interval (min)</label>
                    <input
                      type="number"
                      min="1"
                      value={config.interval_minutes}
                      onChange={(e) => handleConfigChange("interval_minutes", e.target.value === '' ? '' : (parseInt(e.target.value) || ''))}
                      className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm text-center"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Users className="w-3 h-3" /> Group
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="8"
                      value={config.group_size}
                      onChange={(e) => handleConfigChange("group_size", e.target.value === '' ? '' : (parseInt(e.target.value) || ''))}
                      className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm text-center"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <CalendarClock className="w-3 h-3" /> Extra Slots
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={config.extra_slots}
                      onChange={(e) => handleConfigChange("extra_slots", e.target.value === '' ? '' : (parseInt(e.target.value) || ''))}
                      className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm text-center"
                    />
                  </div>
                </div>
              )}

              {/* Auto-generate */}
              {isTeamFormat ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 px-3 h-9 rounded-md border border-input bg-background">
                    <Shuffle className="w-4 h-4 text-muted-foreground shrink-0" />
                    <select
                      value={teamPairStyle}
                      onChange={(e) => setTeamPairStyle(e.target.value)}
                      disabled={!players.length}
                      className="flex-1 bg-transparent text-sm font-medium text-foreground focus:outline-none cursor-pointer min-h-[36px]"
                    >
                      <option value="handicap_balanced">Handicap Balanced</option>
                      <option value="handicap_grouped">Handicap Grouped</option>
                      <option value="diversified">Diversified</option>
                      <option value="seed_by_score">Seed by Score (Leaders Last)</option>
                      <option value="group_priority">Group Priority</option>
                      <option value="pure_random">Random</option>
                      <option value="sequential">Sequential (Roster Order)</option>
                    </select>
                  </div>
                  <Button onClick={handleAutoAssignPairs} className="gap-2 bg-logistics text-logistics-foreground hover:bg-logistics/90" disabled={!players.length}>
                    <Shuffle className="w-4 h-4" />
                    Set Up Teams
                  </Button>
                </div>
              ) : showTeeTimes ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 px-3 h-9 rounded-md border border-input bg-background">
                    <Shuffle className="w-4 h-4 text-muted-foreground shrink-0" />
                    <select
                      value={algorithm}
                      onChange={(e) => setAlgorithm(e.target.value)}
                      disabled={!players.length}
                      className="flex-1 bg-transparent text-sm font-medium text-foreground focus:outline-none cursor-pointer min-h-[36px]"
                    >
                      {ALGORITHMS.map((a) => (
                        <option key={a.value} value={a.value}>{a.label}</option>
                      ))}
                      <option value="seed_by_score">Seed by Score (Leaders Last)</option>
                    </select>
                  </div>
                  <Button onClick={handleGenerate} className="gap-2 bg-logistics text-logistics-foreground hover:bg-logistics/90" disabled={!players.length}>
                    <Shuffle className="w-4 h-4" />
                    Generate
                  </Button>
                </div>
              ) : null}
              {((isTeamFormat && teamPairStyle === "seed_by_score") || (showTeeTimes && !isTeamFormat && algorithm === "seed_by_score")) && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Seed by:</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setSeedScoreType("net")}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        seedScoreType === "net"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground hover:bg-muted/80"
                      }`}
                    >
                      Net
                    </button>
                    <button
                      onClick={() => setSeedScoreType("gross")}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        seedScoreType === "gross"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground hover:bg-muted/80"
                      }`}
                    >
                      Gross
                    </button>
                  </div>
                </div>
              )}
              <Button
                onClick={handleSave}
                disabled={isSaving || (!hasChanges && !hasTeeTimesAssigned)}
                className="gap-1.5 w-full"
              >
                {isSaving ? (
                  <div className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Save
              </Button>
            </CardContent>
          </Card>

          <DragDropContext onDragEnd={handleDragEnd}>
          {showTeeTimes && (
          <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <CalendarClock className="w-4 h-4" /> Tee Times
            </h2>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                onClick={handlePrint}
                disabled={isPrinting || (!slotsWithPlayers.length && !generatedTeeSheetPdfUrl)}
                className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {isPrinting ? (
                  <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                ) : (
                  <Printer className="w-3.5 h-3.5" />
                )}
                Print
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleEmailToMe}
                disabled={!slotsWithPlayers.length}
                className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
                title="Open email app with player BCCs"
              >
                <Mail className="w-3.5 h-3.5" />
                To Me
              </Button>
            </div>
          </div>
          <DraggableTeeSheet
            slotsWithPlayers={slotsWithPlayers}
            unassignedPlayers={unassignedPlayers}
            groupTags={groupTags}
            groupSize={config.group_size || 4}
            onTagChange={(playerId, value) => {
              setGroupTags((prev) => ({ ...prev, [playerId]: value }));
              setHasChanges(true);
            }}
            onMove={(playerId, newTime) => {
              updateAssignment(playerId, newTime);
              setHasChanges(true);
            }}
          />
          </>
          )}

          {/* Team groupings — always visible so Set Up Teams results show
              even when tee times are hidden. Drag-and-drop between teams
              and the unassigned area. */}
          <TeamGroups
            previewPlayers={previewPlayers}
            groupTags={groupTags}
            teamOrder={currentTeamOrder}
            onTagChange={(playerId, value) => {
              setGroupTags((prev) => {
                const next = { ...prev };
                if (value === null || value === undefined || value === "") {
                  delete next[playerId];
                } else {
                  next[playerId] = value;
                }
                return next;
              });
              setHasChanges(true);
            }}
          />
          </DragDropContext>

        </>
      )}

      {/* Print-only scorecards portaled to <body> so they sit outside #root
          and remain in normal flow — page breaks fire correctly (2–3 cards
          per page). Hidden on screen via CSS; shown only in print. */}
      {showScorecards && createPortal(
        <div id="print-scorecards">
          {printPages.map((pageGroups, pi) => (
            <div key={pi} className="print-scorecard-page">
              {pageGroups.map((grp, gi) => (
                <ScorecardHtmlPreview key={gi} round={selectedRound} group={grp} />
              ))}
            </div>
          ))}
        </div>,
        document.body
      )}
      <SendTeeSheetModal
        isOpen={showEmailSelector}
        onClose={() => setShowEmailSelector(false)}
        round={selectedRound}
        players={players}
        assignments={assignments}
      />
    </motion.div>
  );
}