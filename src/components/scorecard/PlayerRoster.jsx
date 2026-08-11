import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Pencil, Check, Mic, MicOff, Users, Lock, ChevronDown, ChevronUp, Info, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";

const formatHandicap = (hcp, isPlus) => {
  if (hcp === null || hcp === undefined) return "0";
  const parsed = parseFloat(hcp);
  if (isNaN(parsed)) return "0";
  // Any negative value is a plus handicap (below scratch), regardless of the isPlus flag
  const isPlusFinal = isPlus || parsed < 0;
  return isPlusFinal ? `+${Math.abs(parsed)}` : String(Math.abs(parsed));
};

const WORD_TO_NUM = {
  zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,
  ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,
  seventeen:17,eighteen:18,nineteen:19,twenty:20,
  "twenty one":21,"twenty two":22,"twenty three":23,"twenty four":24,"twenty five":25,
  "twenty six":26,"twenty seven":27,"twenty eight":28,"twenty nine":29,"thirty":30,
  "thirty six":36,
};

const wordsToNumber = (str) => {
  const lower = str.trim().toLowerCase();
  if (WORD_TO_NUM[lower] !== undefined) return WORD_TO_NUM[lower];
  // Strip any trailing words after a decimal number (e.g. "20.5 Mike" → 20.5, ".4" → 0.4)
  const numMatch = lower.match(/^(\+?[\d]*(?:\.\d+)?)/);
  if (numMatch && numMatch[1]) {
    const n = parseFloat(numMatch[1]);
    if (!isNaN(n)) return n;
  }
  return null;
};

const parseHandicapInput = (str) => {
  const trimmed = (str || "").trim().toLowerCase();
  let isPlus = false;
  let numStr = trimmed;
  if (trimmed.startsWith("+")) { isPlus = true; numStr = trimmed.slice(1).trim(); }
  else if (trimmed.startsWith("-")) { isPlus = true; numStr = trimmed.slice(1).trim(); }
  else if (trimmed.startsWith("plus ")) { isPlus = true; numStr = trimmed.slice(5).trim(); }
  const num = wordsToNumber(numStr);
  return { handicap: num !== null ? num : 0, is_plus_handicap: isPlus };
};

const getTeeColor = (teeName) => {
  const first = teeName?.[0]?.toUpperCase();
  const colors = {
    B: "text-blue-600",
    W: "text-white",
    G: "text-yellow-600",
    Y: "text-yellow-400",
    R: "text-red-600",
  };
  return colors[first] || "text-muted-foreground";
};

// Returns array of {char, color} for each part of a compound tee name
// e.g. "White/Gold" → [{char: "W", color: "text-white"}, {char: "G", color: "text-yellow-600"}]
const getTeeAbbrevColored = (teeName) => {
  if (!teeName) return [];
  const parts = teeName.split(/[/\s]+/).filter(Boolean);
  if (parts.length > 1) {
    return parts.map(p => ({ char: p[0]?.toUpperCase(), color: getTeeColor(p) }));
  }
  return [{ char: teeName[0]?.toUpperCase(), color: getTeeColor(teeName) }];
};

// Module-level cache for course_tee_sets — survives component remounts, keyed by round id
const teeSetsCache = {};

// Compute course handicap: HI × (Slope / 113) + (Rating − Par)
// For PLUS handicaps, the slope ratio is inverted (113 / Slope) so that a
// harder course (higher slope) REDUCES the plus handicap instead of
// increasing it. A +5 player moving to harder tees should become +3, not +7.
const computeCourseHandicap = (hi, isPlus, slope, rating, par) => {
  if (slope == null || rating == null || par == null) return null;
  const totalPar = Array.isArray(par) ? par.reduce((a, b) => a + b, 0) : par;
  const hiVal = isPlus ? -Math.abs(hi) : Math.abs(hi);
  const slopeRatio = isPlus ? (113 / slope) : (slope / 113);
  return Math.round(hiVal * slopeRatio + (rating - totalPar));
};

export default function PlayerRoster({ round, onUpdate }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [handicap, setHandicap] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [showContactFields, setShowContactFields] = useState(false);
  // Persist adjustHandicap on the round entity so it survives page reloads/navigation.
  // Priority: round.handicap_adjustment_mode (DB) > sessionStorage > default true
  const [adjustHandicap, setAdjustHandicap] = useState(() => {
    if (round.handicap_adjustment_mode !== undefined && round.handicap_adjustment_mode !== null) {
      return round.handicap_adjustment_mode;
    }
    try {
      const saved = sessionStorage.getItem(`adjustHandicap_${round.id}`);
      return saved !== null ? saved === 'true' : true;
    } catch { return true; }
  });
  const [editingId, setEditingId] = useState(null);
  const [editingHcp, setEditingHcp] = useState("");
  const [editingName, setEditingName] = useState("");
  const [localPlayers, setLocalPlayers] = useState(round.players || []);
  const localPlayersRef = useRef(round.players || []);
  const processingRef = useRef(new Set());
  const [dictating, setDictating] = useState(false);
  const [lastHeard, setLastHeard] = useState("");
  const recognitionRef = useRef(null);
  const dictatingActiveRef = useRef(false);
  const [originalPlayerCount, setOriginalPlayerCount] = useState(round.player_count || null);
  const defaultTeeRef = useRef(null);
  const playerListRef = useRef(null);
  const addFormRef = useRef(null);

  const { data: masterPlayers = [] } = useQuery({
    queryKey: ["players"],
    queryFn: () => base44.entities.Player.list('-name', 200),
    staleTime: 30 * 60 * 1000, // cache for 30 minutes — player list rarely changes mid-session
  });

  const { data: courseData } = useQuery({
    queryKey: ["course", round.course_name],
    queryFn: async () => {
      if (!round.course_name) return null;
      const courses = await base44.entities.Course.filter({ name: round.course_name });
      return courses[0] || null;
    },
    enabled: !!round.course_name,
  });

  // Sync from server
  useEffect(() => {
    const serverPlayers = round.players || [];
    const localNames = localPlayersRef.current.map(p => p.name);
    const serverHasAll = localNames.every(n => serverPlayers.some(p => p.name === n));
    if (serverHasAll) {
      localPlayersRef.current = serverPlayers;
      serverPlayers.forEach(sp => processingRef.current.delete(sp.name));
      setLocalPlayers(prev => {
        const prevNames = prev.map(p => p.name).join('|');
        const newNames = serverPlayers.map(p => p.name).join('|');
        return prevNames === newNames ? prev : serverPlayers;
      });
    }
    // Always sync originalPlayerCount with round.player_count.
    // The wizard sets this value and we don't auto-update it on roster changes,
    // so it always reflects the latest wizard-set count — including when the user
    // goes back to the wizard, changes it, and returns.
    if (round.player_count) {
      setOriginalPlayerCount(round.player_count);
    }
  }, [round.players, round.player_count]);

  // When courseData loads, recalculate course handicaps — but ONLY for players in auto-adjust mode
  // (i.e. those who already have a non-null course_handicap meaning they were added with auto ON).
  // Players with course_handicap=null were added in manual mode and must not be touched.
  useEffect(() => {
    if (!courseData || !adjustHandicap) return;
    const tees = courseData.tee_sets || [];
    if (!tees.length) return;
    const rg = round.round_gender || "men's";
    const current = localPlayersRef.current;
    if (!current.length) return;
    const recalculated = current.map(p => {
      if (!adjustHandicap) {
        // Auto-adjust OFF: use raw handicap as course_handicap so it shows on scorecards
        const rawCh = p.is_plus_handicap ? -Math.abs(p.handicap) : Math.abs(p.handicap);
        if (rawCh === p.course_handicap) return p;
        return { ...p, course_handicap: rawCh };
      }
      const teeName = p.tee_preference;
      const ts = teeName ? tees.find(t => t.name === teeName) : tees[0];
      const isLadies = (p.tee_gender_preference || rg) === "ladies'";
      const slope = isLadies ? (ts?.ladies_slope ?? ts?.slope ?? round.slope) : (ts?.slope ?? round.slope);
      const rating = isLadies ? (ts?.ladies_rating ?? ts?.rating ?? round.rating) : (ts?.rating ?? round.rating);
      const par = ts?.par ?? round.par;
      const ch = computeCourseHandicap(p.handicap, p.is_plus_handicap, slope, rating, par);
      if (ch === null || ch === p.course_handicap) return p;
      return { ...p, course_handicap: ch };
    });
    const anyChanged = recalculated.some((p, i) => p.course_handicap !== current[i].course_handicap);
    if (anyChanged) {
      localPlayersRef.current = recalculated;
      setLocalPlayers(recalculated);
      // Do NOT save immediately — this effect can fire before the round query
      // refetch completes, so localPlayersRef.current may lack tee_time/tee_group
      // that were set in TournamentLogistics. Saving now would overwrite those
      // DB values with null. Course handicaps are persisted when the user makes
      // other roster changes or clicks "Lock Roster" (which fetches fresh DB
      // data and preserves tee tags).
    }
  }, [courseData]);

  const players = localPlayers;
  // Always prefer live courseData (source of truth with latest ladies_slope/ladies_rating)
  // Fall back to round.course_tee_sets only if courseData not yet loaded
  const courseTeeSets = courseData?.tee_sets || [];
  const freshTeeSets = round.course_tee_sets || [];
  const allTeeSets = courseTeeSets.length > 0 ? courseTeeSets : freshTeeSets;
  const hasLadiesData = allTeeSets.some(t => typeof t.ladies_slope === 'number' || typeof t.ladies_rating === 'number');
  const roundGender = round.round_gender || "men's";
  const hasGenderData = hasLadiesData;
  // For display: all tees still available for per-player override
  const teeSets = allTeeSets;
  const hasMultipleTees = teeSets.length > 1;

  // Default tee by gender convention: ladies → Red (R), men → White (W), fallback to first/last
  const getDefaultTeeForGender = (gender) => {
    if (gender === "ladies'") {
      return teeSets.find(ts => ts.name?.[0]?.toUpperCase() === 'R')?.name
        || teeSets[teeSets.length - 1]?.name
        || defaultTee;
    }
    return teeSets.find(ts => ts.name?.[0]?.toUpperCase() === 'W')?.name
      || teeSets[0]?.name
      || defaultTee;
  };

  // Get tee set data by name
  const getTeeSet = (teeName) => {
    if (!teeName || !teeSets.length) return null;
    return teeSets.find(t => t.name === teeName) || teeSets[0];
  };

  // Default tee set = round's own tee_set
  const defaultTee = round.tee_set || (teeSets[0]?.name) || null;
  defaultTeeRef.current = defaultTee;

  const getPlayerCourseHandicap = (player) => {
    const teeName = player.tee_preference;
    const ts = teeName ? getTeeSet(teeName) : null;
    const isLadies = (player.tee_gender_preference || roundGender) === "ladies'";
    // Priority: 1) gender-specific field on tee set, 2) fallback to men's field, 3) fallback to round defaults
    const slope = ts ? (isLadies ? (ts?.ladies_slope ?? ts?.slope) : ts?.slope) : round.slope;
    const rating = ts ? (isLadies ? (ts?.ladies_rating ?? ts?.rating) : ts?.rating) : round.rating;
    const par = ts?.par ?? round.par;
    if (!adjustHandicap || !slope || !rating) {
      return player.is_plus_handicap ? -Math.abs(player.handicap) : Math.abs(player.handicap);
    }
    return computeCourseHandicap(player.handicap, player.is_plus_handicap, slope, rating, par);
  };

  const buildPlayerEntry = (playerName, hcpStr, teePreference, masterPlayerId = null) => {
    const parsed = parseHandicapInput(hcpStr || "0");
    // No auto-default tee - user must select manually
    const teeName = teePreference || null;
    const ts = teeName ? getTeeSet(teeName) : null;
    const isLadies = roundGender === "ladies'";
    const slope = ts ? (isLadies ? (ts?.ladies_slope ?? ts?.slope) : ts?.slope) : round.slope;
    const rating = ts ? (isLadies ? (ts?.ladies_rating ?? ts?.rating) : ts?.rating) : round.rating;
    const par = ts?.par ?? round.par;
    const courseHandicap = adjustHandicap && slope && rating
      ? computeCourseHandicap(parsed.handicap, parsed.is_plus_handicap, slope, rating, par)
      : (parsed.is_plus_handicap ? -Math.abs(parsed.handicap) : Math.abs(parsed.handicap));
    return {
      player_id: masterPlayerId || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: playerName.trim(),
      handicap: parsed.handicap,
      is_plus_handicap: parsed.is_plus_handicap,
      course_handicap: courseHandicap,
      tee_preference: teeName,
      scores: [],
    };
  };

  const applyLocalUpdate = (updated) => {
    localPlayersRef.current = updated;
    setLocalPlayers(updated);
  };

  // When a new player is added, auto-enroll them in any active side-game pools
  const buildSideGameUpdates = (newPlayerId) => {
    const updates = {};
    if (round.deuce_pot_enabled && (round.deuce_player_ids || []).length > 0) {
      updates.deuce_player_ids = [...(round.deuce_player_ids || []), newPlayerId];
    }
    if (round.kps_enabled && round.kp_separate_buy_in && (round.kp_player_ids || []).length > 0) {
      updates.kp_player_ids = [...(round.kp_player_ids || []), newPlayerId];
    }
    if (round.gross_skins_enabled && round.gross_skins_separate_buy_in && (round.gross_skins_player_ids || []).length > 0) {
      updates.gross_skins_player_ids = [...(round.gross_skins_player_ids || []), newPlayerId];
    }
    if (round.net_skins_enabled && round.net_skins_separate_buy_in && (round.net_skins_player_ids || []).length > 0) {
      updates.net_skins_player_ids = [...(round.net_skins_player_ids || []), newPlayerId];
    }
    return updates;
  };

  const addPlayer = () => {
    if (!name.trim()) { toast.error("Player name is required"); return; }
    // Check if a master player with this name exists - if so, use their ID and contact info
    const matchingMaster = masterPlayers.find(mp => mp.name.toLowerCase() === name.trim().toLowerCase());
    const parsed = parseHandicapInput(handicap || "0");
    const teeName = null;
    const ts = teeName ? getTeeSet(teeName) : null;
    const isLadies = roundGender === "ladies'";
    const slope = ts ? (isLadies ? (ts?.ladies_slope ?? ts?.slope) : ts?.slope) : round.slope;
    const rating = ts ? (isLadies ? (ts?.ladies_rating ?? ts?.rating) : ts?.rating) : round.rating;
    const par = ts?.par ?? round.par;
    const courseHandicap = adjustHandicap && slope && rating
      ? computeCourseHandicap(parsed.handicap, parsed.is_plus_handicap, slope, rating, par)
      : (parsed.is_plus_handicap ? -Math.abs(parsed.handicap) : Math.abs(parsed.handicap));
    const entry = {
      player_id: matchingMaster ? matchingMaster.id : `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      handicap: parsed.handicap,
      is_plus_handicap: parsed.is_plus_handicap,
      course_handicap: courseHandicap,
      tee_preference: teeName,
      scores: [],
      ...(contactPhone.trim() && { mobile_phone: contactPhone.trim() }),
      ...(contactEmail.trim() && { email: contactEmail.trim() }),
    };
    const updated = [...players, entry];
    applyLocalUpdate(updated);
    onUpdate({ players: updated, ...buildSideGameUpdates(entry.player_id), _immediate: true });
    setName("");
    setHandicap("");
    setContactPhone("");
    setContactEmail("");
    setShowContactFields(false);
    setTimeout(() => {
      playerListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const addFromMaster = (mp) => {
    const current = localPlayersRef.current;
    if (current.find(p => p.name === mp.name)) { 
      toast.error(`${mp.name} is already on the roster`); 
      return; 
    }
    processingRef.current.add(mp.name);
    const hcpStr = formatHandicap(mp.handicap, mp.is_plus_handicap);
    const parsed = parseHandicapInput(hcpStr || "0");
    const teeName = null;
    const ts = teeName ? getTeeSet(teeName) : null;
    const isLadies = roundGender === "ladies'";
    const slope = ts ? (isLadies ? (ts?.ladies_slope ?? ts?.slope) : ts?.slope) : round.slope;
    const rating = ts ? (isLadies ? (ts?.ladies_rating ?? ts?.rating) : ts?.rating) : round.rating;
    const par = ts?.par ?? round.par;
    const courseHandicap = adjustHandicap && slope && rating
      ? computeCourseHandicap(parsed.handicap, parsed.is_plus_handicap, slope, rating, par)
      : (parsed.is_plus_handicap ? -Math.abs(parsed.handicap) : Math.abs(parsed.handicap));
    const entry = {
      player_id: mp.id,
      name: mp.name.trim(),
      handicap: parsed.handicap,
      is_plus_handicap: parsed.is_plus_handicap,
      course_handicap: courseHandicap,
      tee_preference: teeName,
      scores: [],
    };
    const updated = [...current, entry];
    applyLocalUpdate(updated);
    onUpdate({ players: updated, ...buildSideGameUpdates(entry.player_id), _immediate: true });
  };

  const removePlayer = (playerId) => {
    const updated = localPlayersRef.current.filter(p => p.player_id !== playerId);
    applyLocalUpdate(updated);
    onUpdate({ players: updated, _immediate: true });
  };

  const startEdit = (player) => {
    setEditingId(player.player_id);
    setEditingHcp(formatHandicap(player.handicap, player.is_plus_handicap));
    setEditingName(player.name);
  };

  const saveEdit = (player) => {
    const parsed = parseHandicapInput(editingHcp);
    const teeName = player.tee_preference;
    const ts = teeName ? getTeeSet(teeName) : null;
    const isLadies = (player.tee_gender_preference || roundGender) === "ladies'";
    const slope = ts ? (isLadies ? (ts?.ladies_slope ?? ts?.slope) : ts?.slope) : round.slope;
    const rating = ts ? (isLadies ? (ts?.ladies_rating ?? ts?.rating) : ts?.rating) : round.rating;
    const par = ts?.par ?? round.par;
    const courseHandicap = adjustHandicap && slope && rating
      ? computeCourseHandicap(parsed.handicap, parsed.is_plus_handicap, slope, rating, par)
      : (parsed.is_plus_handicap ? -Math.abs(parsed.handicap) : Math.abs(parsed.handicap));
    const updated = players.map(p =>
      p.player_id === player.player_id
        ? { ...p, ...parsed, name: editingName.trim() || p.name, course_handicap: courseHandicap }
        : p
    );
    applyLocalUpdate(updated);
    onUpdate({ players: updated, _immediate: true });
    setEditingId(null);
  };

  const setTeePreference = (playerId, teeName) => {
    const updated = players.map(p => {
      if (p.player_id !== playerId) return p;
      const ts = teeName ? getTeeSet(teeName) : null;
      const isLadies = (p.tee_gender_preference || roundGender) === "ladies'";
      const slope = ts ? (isLadies ? (ts?.ladies_slope ?? ts?.slope) : ts?.slope) : round.slope;
      const rating = ts ? (isLadies ? (ts?.ladies_rating ?? ts?.rating) : ts?.rating) : round.rating;
      const par = ts?.par ?? round.par;
      const courseHandicap = adjustHandicap && slope && rating
        ? computeCourseHandicap(p.handicap, p.is_plus_handicap, slope, rating, par)
        : (p.is_plus_handicap ? -Math.abs(p.handicap) : Math.abs(p.handicap));
      return { ...p, tee_preference: teeName, course_handicap: courseHandicap };
    });
    applyLocalUpdate(updated);
    onUpdate({ players: updated, _immediate: true });
  };

  // Multi-day series: copy the parent (Day 1) round's roster — names, handicaps,
  // tee preferences, and team tags (tee_group) — so Day 2+ keeps the same teams.
  const [carryingOver, setCarryingOver] = useState(false);
  const carryOverFromParent = async () => {
    if (!round.parent_round_id) return;
    setCarryingOver(true);
    try {
      // For hybrid tournaments, find the first day of the SAME flight — not
      // the anchor (Flight 1, Day 1). parent_round_id always points to the
      // anchor, but each flight has its own roster that carries over
      // day-by-day within that flight. Using the anchor would pull Flight 1's
      // players (and player_ids) into Flight 2, causing player_id mismatches
      // that break two-day cumulative totals.
      let sourceRound = null;
      const isHybrid = !!(round.is_multi_day && round.is_multi_flight);
      if (isHybrid && round.flight_number && round.flight_number > 1) {
        const children = await base44.entities.Round.filter({ parent_round_id: round.parent_round_id });
        const flightRounds = (children || [])
          .filter(r => (r.flight_number || 1) === round.flight_number && r.id !== round.id)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        sourceRound = flightRounds[0] || null;
        if (!sourceRound) {
          toast.error("No previous day found in this flight. Add players manually for this new flight.");
          return;
        }
      }
      // For non-hybrid or Flight 1, use the parent (anchor) round directly
      if (!sourceRound) {
        sourceRound = await base44.entities.Round.get(round.parent_round_id);
      }
      const parentPlayers = sourceRound?.players || [];
      if (!parentPlayers.length) {
        toast.error("The source round has no roster yet. Add players on Day 1 first.");
        return;
      }
      // Recompute course handicaps for the child round's course/tees.
      const copied = parentPlayers.map(p => {
        const teeName = p.tee_preference || null;
        const ts = teeName ? getTeeSet(teeName) : null;
        const isLadies = (p.tee_gender_preference || roundGender) === "ladies'";
        const slope = ts ? (isLadies ? (ts?.ladies_slope ?? ts?.slope) : ts?.slope) : round.slope;
        const rating = ts ? (isLadies ? (ts?.ladies_rating ?? ts?.rating) : ts?.rating) : round.rating;
        const par = ts?.par ?? round.par;
        const courseHandicap = adjustHandicap && slope && rating
          ? computeCourseHandicap(p.handicap, p.is_plus_handicap, slope, rating, par)
          : (p.is_plus_handicap ? -Math.abs(p.handicap) : Math.abs(p.handicap));
        return {
          player_id: p.player_id,
          name: p.name,
          handicap: p.handicap,
          is_plus_handicap: p.is_plus_handicap,
          course_handicap: courseHandicap,
          tee_preference: teeName,
          tee_gender_preference: p.tee_gender_preference,
          tee_group: p.tee_group,
          scores: [],
        };
      });
      applyLocalUpdate(copied);
      onUpdate({ players: copied, player_count: copied.length, _immediate: true });
      const flightLabel = isHybrid && round.flight_number > 1 ? `Flight ${round.flight_number}, ` : '';
      toast.success(`Carried over ${copied.length} players and teams from ${flightLabel}Day 1`);
    } catch (e) {
      toast.error("Could not load the parent round's roster.");
    } finally {
      setCarryingOver(false);
    }
  };

  const lockRoster = async () => {
    if (players.length === 0) { toast.error("Add at least one player before locking the roster"); return; }
    // Fetch fresh players from the DB so we preserve tee_group/tee_time tags
    // that were set in TournamentLogistics but may not yet be reflected in the
    // local cache (the single-round cache can go stale across page navigation,
    // e.g. on Day 2 of a multi-day series).
    let dbPlayers = null;
    try {
      const fresh = await base44.entities.Round.get(round.id);
      dbPlayers = fresh?.players || null;
    } catch {}
    // Recompute all course handicaps with current adjustment setting, and
    // merge in the DB's tee tags (Logistics is authoritative for assignments).
    const updatedPlayers = players.map(p => {
      const ch = getPlayerCourseHandicap(p);
      const dbMatch = dbPlayers?.find(fp => fp.player_id === p.player_id);
      if (dbMatch) {
        return { ...p, course_handicap: ch, tee_group: dbMatch.tee_group, tee_time: dbMatch.tee_time };
      }
      return { ...p, course_handicap: ch };
    });
    onUpdate({ players: updatedPlayers, player_count: updatedPlayers.length, status: "scoring", _immediate: true });
    // Scroll to absolute top of page
    setTimeout(() => {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }, 300);
  };

  // Voice dictation: say "John Smith 14", pause → player added → listens again automatically
  const startDictation = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { toast.error("Voice input not supported in this browser"); return; }

    dictatingActiveRef.current = true;
    setDictating(true);

    const listen = () => {
      if (!dictatingActiveRef.current) return;

      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript.trim();
        setLastHeard(transcript);

        // Split on "handicap" keyword to handle multiple players in one transcript
        // e.g. "Grant handicap 20 Mike handicap 6 Rex handicap 1"
        const parseAndAdd = (text, knownHcp = null) => {
          text = text.trim();
          if (!text) return;

          let playerName = text;
          let hcp = "0";

          if (knownHcp !== null) {
            // HCP already extracted from "handicap" splitting — use it directly
            hcp = String(knownHcp);
          } else {
            // Try last two words as spoken number (e.g. "twenty two")
            const twoWord = text.match(/^(.+)\s+(\w+\s+\w+)$/);
            if (twoWord) {
              const num = wordsToNumber(twoWord[2].trim());
              if (num !== null && num > 0) { playerName = twoWord[1].trim(); hcp = String(num); }
            }
            // Then try last single digit/word
            if (hcp === "0") {
              const oneWord = text.match(/^(.+)\s+(\+?[\d.]+|\w+)$/);
              if (oneWord) {
                const num = wordsToNumber(oneWord[2].trim());
                if (num !== null && num > 0) { playerName = oneWord[1].trim(); hcp = String(num); }
              }
            }
          }

          if (playerName) {
            const current = localPlayersRef.current;
            const matchingMaster = masterPlayers.find(mp => mp.name.toLowerCase() === playerName.toLowerCase());
            const parsedHandicap = parseHandicapInput(hcp);
            const teeName = defaultTeeRef.current;
            const ts = teeName ? getTeeSet(teeName) : null;
            const isLadies = roundGender === "ladies'";
            const slope = ts ? (isLadies ? (ts?.ladies_slope ?? ts?.slope) : ts?.slope) : round.slope;
            const rating = ts ? (isLadies ? (ts?.ladies_rating ?? ts?.rating) : ts?.rating) : round.rating;
            const par = ts?.par ?? round.par;
            const courseHandicap = adjustHandicap && slope && rating
              ? computeCourseHandicap(parsedHandicap.handicap, parsedHandicap.is_plus_handicap, slope, rating, par)
              : (parsedHandicap.is_plus_handicap ? -Math.abs(parsedHandicap.handicap) : Math.abs(parsedHandicap.handicap));
            const entry = {
              player_id: matchingMaster ? matchingMaster.id : `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              name: playerName.trim(),
              handicap: parsedHandicap.handicap,
              is_plus_handicap: parsedHandicap.is_plus_handicap,
              course_handicap: courseHandicap,
              tee_preference: teeName,
              scores: [],
            };
            const updated = [...current, entry];
            localPlayersRef.current = updated;
            setLocalPlayers(updated);
            onUpdate({ players: updated, _immediate: true });
            toast.success(`Added ${playerName} (HCP ${hcp})`);
          }
        };

        // Split transcript on "handicap" boundaries to extract multiple players
        // Pattern: split where a number is followed by a new name (before next "handicap")
        const parts = transcript.split(/\bhandicap\b/i);
        if (parts.length > 1) {
          // parts[0] = first name, parts[1] = "hcp1 name2", parts[2] = "hcp2 name3", etc.
          let pendingName = parts[0].trim();
          for (let i = 1; i < parts.length; i++) {
            const chunk = parts[i].trim(); // e.g. "20.5 Mike" or "five"
            if (!chunk) continue; // trailing "handicap" with nothing after — skip
            // Extract leading number (digit or word), rest = next player name
            const tokens = chunk.split(/\s+/);
            const firstToken = tokens[0];
            const hcpVal = wordsToNumber(firstToken);
            if (hcpVal !== null && pendingName) {
              parseAndAdd(pendingName, hcpVal);
              pendingName = tokens.slice(1).join(' ').trim();
            } else {
              // Couldn't parse a number — try two-word number (e.g. "twenty five")
              const twoTokens = tokens.slice(0, 2).join(' ');
              const hcpVal2 = wordsToNumber(twoTokens);
              if (hcpVal2 !== null && pendingName) {
                parseAndAdd(pendingName, hcpVal2);
                pendingName = tokens.slice(2).join(' ').trim();
              } else {
                pendingName = (pendingName + " handicap " + chunk).trim();
              }
            }
          }
          // Last pending name — add with hcp 0 (no handicap was spoken for them)
          if (pendingName && pendingName.trim()) {
            parseAndAdd(pendingName.trim());
          }
        } else {
          // Single player, no "handicap" keyword
          parseAndAdd(transcript);
        }
      };

      recognition.onerror = (err) => {
        // no-speech just means silence — keep going
        if (err.error === "no-speech") return;
        if (err.error === "aborted") return;
        toast.error(`Voice error: ${err.error}`);
        dictatingActiveRef.current = false;
        setDictating(false);
      };

      recognition.onend = () => {
        if (dictatingActiveRef.current) {
          setTimeout(listen, 200);
        }
      };

      try {
        recognition.start();
      } catch (e) {
        toast.error(`Could not start microphone: ${e.message}`);
        dictatingActiveRef.current = false;
        setDictating(false);
      }
    };

    listen();
  };

  const stopDictation = () => {
    dictatingActiveRef.current = false;
    try { recognitionRef.current?.stop(); } catch (_) {}
    recognitionRef.current = null;
    setDictating(false);
    setLastHeard("");
  };

  const hasSlope = round.slope != null || (teeSets.length > 0 && teeSets[0]?.slope != null);

  const setTeeForAllPlayers = (teeName) => {
    const updated = players.map(p => {
      const ts = getTeeSet(teeName);
      const isLadies = (p.tee_gender_preference || roundGender) === "ladies'";
      const slope = ts ? (isLadies ? (ts?.ladies_slope ?? ts?.slope) : ts?.slope) : round.slope;
      const rating = ts ? (isLadies ? (ts?.ladies_rating ?? ts?.rating) : ts?.rating) : round.rating;
      const par = ts?.par ?? round.par;
      const courseHandicap = adjustHandicap && slope && rating
        ? computeCourseHandicap(p.handicap, p.is_plus_handicap, slope, rating, par)
        : (p.is_plus_handicap ? -Math.abs(p.handicap) : Math.abs(p.handicap));
      return { ...p, tee_preference: teeName, course_handicap: courseHandicap };
    });
    applyLocalUpdate(updated);
    onUpdate({ players: updated, _immediate: true });
    toast.success(`Applied ${teeName} tee to all players`);
  };

  const addTestPlayers = () => {
    const testNames = [
      "Alice Johnson", "Bob Smith", "Charlie Brown", "Diana Prince", "Eve Wilson",
      "Frank Garcia", "Grace Lee", "Henry Davis", "Iris Martinez", "Jack Wilson",
      "Karen Anderson", "Leo Taylor", "Megan Thomas", "Noah Jackson", "Olivia White",
      "Paul Harris", "Quinn Robinson", "Ryan Clark", "Sarah Lewis", "Tom Walker",
      "Uma Young", "Victor Hall", "Wendy Allen", "Xavier King", "Yara Scott",
      "Zoe Green", "Adam Baker", "Bella Nelson", "Caleb Carter", "Diana Mitchell",
      "Ethan Perez", "Fiona Roberts", "Gus Phillips", "Hannah Campbell", "Ian Parker",
      "Julia Evans", "Kevin Edwards", "Lisa Collins", "Mark Stewart", "Nina Sanchez",
      "Oscar Morris"
    ];
    const targetCount = originalPlayerCount || round.player_count || 8;
    const testPlayers = testNames.slice(0, targetCount).map(name =>
      buildPlayerEntry(name, String(Math.floor(Math.random() * 20)), null)
    );
    const updated = [...players, ...testPlayers];
    applyLocalUpdate(updated);
    onUpdate({ players: updated, _immediate: true });
    toast.success(`Added ${testPlayers.length} test player(s)`);
  };

  return (
    <div className="space-y-4">
      {/* Carry-over roster & teams from the parent (Day 1) round */}
      {round.parent_round_id && players.length === 0 && (
        <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Users className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">Carry over teams from Day 1</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                Copy the parent round's roster — names, handicaps, tee preferences, and team tags — so Day 2 keeps the same teams.
              </p>
            </div>
          </div>
          <Button
            onClick={carryOverFromParent}
            disabled={carryingOver}
            className="w-full gap-2"
            type="button"
          >
            {carryingOver ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
            {carryingOver ? "Loading…" : "Carry over Roster & Teams"}
          </Button>
        </div>
      )}

      {/* Add player form */}
      <Card ref={addFormRef} className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="w-4 h-4" /> Player Roster
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Handicap adjustment toggle */}
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <p className="text-sm font-medium">Auto Handicap Adjustment</p>
              <p className="text-xs text-muted-foreground">
                {adjustHandicap
                  ? "Using handicap index to create course handicap"
                  : "Using manual handicap as-is"}
              </p>
            </div>
            <Switch checked={adjustHandicap} onCheckedChange={(val) => {
              setAdjustHandicap(val);
              try { sessionStorage.setItem(`adjustHandicap_${round.id}`, String(val)); } catch {}
              // Recalculate course handicaps for ALL players when toggle changes
              const current = localPlayersRef.current;
              if (current.length > 0) {
                const recalculated = current.map(p => {
                  if (val) {
                    const teeName = p.tee_preference;
                    const ts = teeName ? getTeeSet(teeName) : null;
                    const isLadies = (p.tee_gender_preference || roundGender) === "ladies'";
                    const slope = ts ? (isLadies ? (ts?.ladies_slope ?? ts?.slope) : ts?.slope) : round.slope;
                    const rating = ts ? (isLadies ? (ts?.ladies_rating ?? ts?.rating) : ts?.rating) : round.rating;
                    const par = ts?.par ?? round.par;
                    const ch = (slope && rating) ? computeCourseHandicap(p.handicap, p.is_plus_handicap, slope, rating, par) : null;
                    return { ...p, course_handicap: ch };
                  }
                  // Auto-adjust OFF: use raw handicap as course_handicap so it shows on scorecards
                  return { ...p, course_handicap: p.is_plus_handicap ? -Math.abs(p.handicap) : Math.abs(p.handicap) };
                });
                applyLocalUpdate(recalculated);
                onUpdate({ players: recalculated, handicap_adjustment_mode: val, _immediate: true });
              } else {
                onUpdate({ handicap_adjustment_mode: val });
              }
            }} />
          </div>

          {adjustHandicap && !hasSlope && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠️ No slope/rating data — set up course info above for accurate course handicaps.
            </div>
          )}

          {!adjustHandicap && hasMultipleTees && (
            <div className="text-xs text-muted-foreground bg-muted/40 border border-border rounded-lg px-3 py-2">
              ℹ️ Auto handicap adjustment is off — tee selection is ignored and handicaps are used as entered.
            </div>
          )}

          {/* How to add players tip */}
          <div className="flex items-start gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <span className="text-base shrink-0">💡</span>
            <p className="text-xs text-foreground leading-relaxed">
              <strong>Type a name below</strong> to manually add a player, tap the <strong>🎤 mic</strong> to dictate players by voice, or tap a name from your <strong>Master Roster</strong> to instantly add them with their saved handicap.
            </p>
          </div>

          {/* Manual add */}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Input
                placeholder="Player name"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addPlayer()}
                className="flex-1 min-w-0"
                type="text"
                inputMode="text"
                autoComplete="off"
              />
              <input
                placeholder="+2 / 14"
                value={handicap}
                onChange={e => setHandicap(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addPlayer()}
                className="w-24 flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                type="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>
            {/* Optional contact info for one-time players */}
            <button
              type="button"
              onClick={() => setShowContactFields(v => !v)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all w-full ${
                showContactFields
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "bg-muted/40 border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted/70"
              }`}
            >
              <span className="text-base">{showContactFields ? "📵" : "📱"}</span>
              <span className="flex-1 text-left">{showContactFields ? "Hide contact info" : "Add phone / email for results"}</span>
              {showContactFields ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showContactFields && (
              <div className="flex flex-col gap-2 p-3 bg-muted/30 rounded-lg border border-border">
                <Input
                  placeholder="Phone number (for SMS results)"
                  value={contactPhone}
                  onChange={e => setContactPhone(e.target.value)}
                  className="bg-card"
                  type="tel"
                  inputMode="tel"
                />
                <Input
                  placeholder="Email address (for results)"
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  className="bg-card"
                  type="email"
                  inputMode="email"
                />
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={addPlayer} className="flex-1 gap-2" type="button">
                <Plus className="w-4 h-4" />
                Add Player
              </Button>
              <Button
                variant={dictating ? "destructive" : "outline"}
                size="icon"
                onClick={dictating ? stopDictation : startDictation}
                className="shrink-0"
                title="Dictate players via voice"
                type="button"
              >
                {dictating ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={addTestPlayers}
                className="shrink-0"
                title="Add test players"
                type="button"
              >
                Trial Players
              </Button>
            </div>
          </div>

          {/* Dictation status */}
          {dictating && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
              {lastHeard ? <span className="text-foreground font-medium">Heard: "{lastHeard}"</span> : <span>Listening… say "Name handicap 12"</span>}
            </div>
          )}

          {/* Master roster quick-add */}
           {masterPlayers.length > 0 && (
             <div className="pt-1">
               <div className="flex items-center gap-2 mb-2 p-2.5 bg-accent/15 border border-accent/40 rounded-lg">
                 <span className="text-base">⭐</span>
                 <div className="flex-1">
                   <p className="text-sm font-bold text-foreground">Master Roster</p>
                   <p className="text-xs text-muted-foreground">Tap any name to instantly add them</p>
                 </div>
                 <span className="text-xs text-muted-foreground font-medium">{masterPlayers.length} players</span>
               </div>
               <div className="grid grid-cols-2 gap-1.5">
                 {[...masterPlayers].sort((a, b) => a.name.localeCompare(b.name)).map(mp => {
                  const isOnRoster = localPlayersRef.current.some(p => p.name === mp.name);
                  const isProcessing = processingRef.current.has(mp.name);
                  const disabled = isOnRoster || isProcessing;
                  return (
                    <button
                      key={mp.id}
                      onClick={() => addFromMaster(mp)}
                      disabled={disabled}
                      className={`px-2.5 py-1 text-xs rounded-full border font-medium transition-all ${
                        disabled
                          ? "bg-muted text-muted-foreground border-border opacity-50 cursor-not-allowed"
                          : "bg-card text-foreground border-border hover:border-primary hover:bg-primary/10"
                      }`}
                    >
                      {mp.name} ({formatHandicap(mp.handicap, mp.is_plus_handicap)})
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Player list */}
      {players.length > 0 && (
        <Card ref={playerListRef} className="border-0 shadow-sm">
          <CardHeader className="pb-1 flex flex-col gap-2">
            <div className="flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold">Players ({players.length})</CardTitle>
            </div>
            {hasMultipleTees && (
              <div className="flex gap-1 flex-wrap items-center">
                <span className="text-xs text-muted-foreground font-medium mr-1">Tee Selection</span>
                {teeSets
                  .filter(ts => {
                    if (roundGender === "ladies'") {
                      return ts.gender === "ladies'" || typeof ts.ladies_slope === 'number';
                    }
                    // men's: exclude ladies'-only tees
                    return ts.gender !== "ladies'";
                  })
                  .map(ts => (
                    <Button
                      key={ts.name}
                      variant="outline"
                      size="sm"
                      onClick={() => setTeeForAllPlayers(ts.name)}
                      className="h-7 text-xs gap-1"
                    >
                      {getTeeAbbrevColored(ts.name).map((part, i) => (
                        <span key={i} className={part.color}>{part.char}</span>
                      ))}
                      <span className="text-xs text-muted-foreground">all</span>
                    </Button>
                  ))}
              </div>
            )}
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {players.map((player) => {
              const ch = getPlayerCourseHandicap(player);
              const teeName = player.tee_preference;
              return (
                <div key={player.player_id} className="flex items-start gap-2 p-3 bg-secondary/30 rounded-lg">
                  <div className="flex-1 min-w-0">
                    {editingId === player.player_id ? (
                      <Input
                        type="text"
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && saveEdit(player)}
                        className="h-7 text-sm font-medium mb-1"
                        autoFocus
                      />
                    ) : (
                      <p className="font-medium text-foreground truncate">{player.name}</p>
                    )}
                    {/* Handicap below name */}
                    {editingId === player.player_id ? (
                      <input
                        type="text"
                        value={editingHcp}
                        onChange={e => setEditingHcp(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && saveEdit(player)}
                        className="h-6 w-24 text-xs px-1 mt-1 rounded-md border border-input bg-transparent shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        placeholder="+2 or 14"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground font-medium mt-0.5">
                        HI {formatHandicap(player.handicap, player.is_plus_handicap)}
                        {ch != null && (
                          <span className="ml-1 text-primary">{adjustHandicap ? '→ CH ' : '→ HCP '}{formatHandicap(ch, ch < 0)}</span>
                        )}
                      </p>
                    )}
                    {/* Tee selection below handicap */}
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      {/* Gender override */}
                      {hasGenderData && (
                        <div className="flex gap-1">
                          {["men's", "ladies'"].map(g => {
                            const active = (player.tee_gender_preference || roundGender) === g;
                            return (
                              <button
                                key={g}
                                onClick={() => {
                                    const updated = players.map(p => {
                                            if (p.player_id !== player.player_id) return p;
                                            const teeName = p.tee_preference;
                                            const ts = teeName ? getTeeSet(teeName) : null;
                                            const isLadies = g === "ladies'";
                                            const slope = ts ? (isLadies ? (ts?.ladies_slope ?? ts?.slope) : ts?.slope) : round.slope;
                                            const rating = ts ? (isLadies ? (ts?.ladies_rating ?? ts?.rating) : ts?.rating) : round.rating;
                                            const par = ts?.par ?? round.par;
                                            const courseHandicap = adjustHandicap && slope && rating
                                              ? computeCourseHandicap(p.handicap, p.is_plus_handicap, slope, rating, par)
                                              : (p.is_plus_handicap ? -Math.abs(p.handicap) : Math.abs(p.handicap));
                                            return { ...p, tee_gender_preference: g, course_handicap: courseHandicap };
                                          });
                                        applyLocalUpdate(updated);
                                        onUpdate({ players: updated, _immediate: true });
                                      }}
                                className={`px-1.5 py-0.5 text-xs rounded border font-medium transition-all ${
                                  active
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-card text-muted-foreground border-border hover:border-primary"
                                }`}
                              >
                                {g === "men's" ? "M" : "L"}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {/* Tee preference buttons */}
                      {hasMultipleTees && (
                        <div className="flex gap-1 flex-wrap">
                          {teeSets
                            .filter(ts => {
                              const playerGender = player.tee_gender_preference || roundGender;
                              const isLadies = playerGender === "ladies'";
                              const courseTeeSet = courseData?.tee_sets?.find(ct => ct.name === ts.name) || ts;
                              if (isLadies) {
                                return courseTeeSet?.gender === "ladies'" || typeof courseTeeSet?.ladies_slope === 'number';
                              }
                              // men's: exclude ladies'-only tees
                              return courseTeeSet?.gender !== "ladies'";
                            })
                            .map(ts => {
                              const playerGender = player.tee_gender_preference || roundGender;
                              const isLadies = playerGender === "ladies'";
                              const courseTeeSet = courseData?.tee_sets?.find(ct => ct.name === ts.name) || ts;
                              const teeHasLadiesData = typeof courseTeeSet?.ladies_slope === 'number' || typeof courseTeeSet?.ladies_rating === 'number';
                              const someTeeHasLadiesData = courseData?.tee_sets?.length > 0 
                                ? courseData.tee_sets.some(ct => typeof ct.ladies_slope === 'number' || typeof ct.ladies_rating === 'number')
                                : teeSets.some(t => typeof t.ladies_slope === 'number' || typeof t.ladies_rating === 'number');
                              const unavailable = isLadies && someTeeHasLadiesData && !teeHasLadiesData;
                              return (
                                <button
                                  key={ts.name}
                                  onClick={() => !unavailable && setTeePreference(player.player_id, ts.name)}
                                  disabled={unavailable}
                                  className={`px-1.5 py-0.5 text-xs rounded border font-medium transition-all bg-card border-border ${
                                    unavailable
                                      ? "opacity-30 cursor-not-allowed"
                                      : teeName === ts.name
                                        ? "ring-2 ring-offset-1 ring-foreground hover:border-primary"
                                        : "text-muted-foreground hover:border-primary"
                                    }`}
                                >
                                  {getTeeAbbrevColored(ts.name).map((part, i) => (
                                    <span key={i} className={part.color}>{part.char}</span>
                                  ))}
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  </div>
                  {editingId === player.player_id ? (
                    <Button variant="ghost" size="icon" onClick={() => saveEdit(player)}>
                      <Check className="w-4 h-4 text-primary" />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon" onClick={() => startEdit(player)}>
                      <Pencil className="w-4 h-4 text-edit" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removePlayer(player.player_id)}
                    className="text-destructive hover:text-destructive/80"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            })}
            {/* Add more players button — always visible below last player */}
            <button
              type="button"
              onClick={() => addFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="w-full mt-2 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary font-semibold text-sm transition-colors"
            >
              ↑ Add More Players
            </button>
          </CardContent>
        </Card>
      )}

      {/* Player count info */}
      {originalPlayerCount && players.length > 0 && players.length !== originalPlayerCount && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-400">
          ℹ️ Note: You originally set up this round for <strong className="mx-0.5">{originalPlayerCount}</strong> players, but the roster now has <strong className="mx-0.5">{players.length}</strong>. The count has been automatically updated.
        </div>
      )}

      {/* Lock roster button */}
      <div className="flex flex-col gap-3">
        <Button
          size="lg"
          className="w-full gap-2 shadow-lg shadow-primary/20"
          onClick={lockRoster}
          disabled={players.length === 0}
          data-lock-roster="true"
        >
          <Lock className="w-4 h-4" />
          Lock Roster & Start Scoring
        </Button>
        
        {/* Optional Tee Sheet & Scorecards link */}
        {players.length > 0 && (
          <Button
            onClick={() => {
              // Clear any scroll-to-bottom intent so it can't interfere with the new page
              window.scrollTo(0, 0);
              navigate('/TournamentLogistics');
            }}
            className="w-full gap-2 shadow-lg shadow-logistics/20 bg-logistics text-logistics-foreground hover:bg-logistics/90"
          >
            <Clock className="w-4 h-4" />
            {(round.game_type && round.game_type !== 'individual')
              ? 'Organize Teams'
              : 'Tee Times & Scorecards (Optional)'}
          </Button>
        )}
        {(players.length > 0 && round.game_type && round.game_type !== 'individual') && (
          <p className="text-center text-sm text-muted-foreground">
            Organizing teams is required · Tee times &amp; scorecards optional
          </p>
        )}
      </div>
    </div>
  );
}