import React, { useState, useRef, useCallback, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ChevronLeft, Calculator, Loader2, Info, Hand, Keyboard, Mic, Camera, AlertCircle, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { toast } from "sonner";

import PlayerRoster from "@/components/scorecard/PlayerRoster";
import CourseSetup from "@/components/scorecard/CourseSetup";
import ScoreEntry from "@/components/scorecard/ScoreEntry";
import TapScoreEntry from "@/components/scorecard/TapScoreEntry";
import KPEntry from "@/components/scorecard/KPEntry";
import SideGamePlayers from "@/components/scorecard/SideGamePlayers";
import ScoreSummary from "@/components/scorecard/ScoreSummary";
import TeamScoreSummary from "@/components/scorecard/TeamScoreSummary";

import { computeResults } from "@/lib/swiftScoreEngine";
import { loadRoundScores, savePlayerScore, saveAllScores, mergeScoresIntoRound } from "@/lib/roundScores";
import PageDescription from "@/components/PageDescription";
import InfoTooltip from "@/components/InfoTooltip";
import ScorecardScanner from "@/components/scanner/ScorecardScanner";
import ScanReviewModal from "@/components/scanner/ScanReviewModal";
import ScorecardPrintButton from "@/components/scorecard/ScorecardPrintButton";

export default function Scorecard() {

  const location = useLocation();
  const urlParams = new URLSearchParams(location.search);
  const roundIdFromUrl = urlParams.get("id");
  // Persist roundId in sessionStorage so a page refresh doesn't lose it
  if (roundIdFromUrl) sessionStorage.setItem("lastRoundId", roundIdFromUrl);
  const roundId = roundIdFromUrl || sessionStorage.getItem("lastRoundId");
  // Restore URL if ID came from session (after refresh)
  useEffect(() => {
    if (!roundIdFromUrl && roundId) {
      window.history.replaceState(null, "", `/Scorecard?id=${roundId}`);
    }
  }, []);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [computeErrors, setComputeErrors] = useState(null);
  const [scoreSummaryEditing, setScoreSummaryEditing] = useState(false);
  const [summaryView, setSummaryView] = useState(() => {
    try { return sessionStorage.getItem(`summaryView_${roundIdFromUrl}`) || 'individual'; } catch { return 'individual'; }
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isComputing, setIsComputing] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannedData, setScannedData] = useState(null);
  const [showScanReview, setShowScanReview] = useState(false);
  const [scanDebug, setScanDebug] = useState(null);

  const [liveScores, setLiveScores] = useState(() => {
    if (!roundId) return null;
    try {
      const saved = sessionStorage.getItem(`liveScores_${roundId}`);
      if (saved) return JSON.parse(saved);
      const backup = localStorage.getItem(`liveScores_backup_${roundId}`);
      return backup ? JSON.parse(backup) : null;
    } catch { return null; }
  });
  // initialScoresRef: set ONCE when DB scores first load — never overwritten after that.
  // Passed to TapScoreEntry/ScoreEntry as initialScores so they initialize correctly,
  // but subsequent DB polls never change this ref and can't corrupt in-progress scoring.
  const initialScoresRef = useRef(null);
  const initialScoresLoadedRef = useRef(false);

  // onScoresChange: write to ref (no re-render during rapid scoring),
  // but also update liveScores state so ScoreSummary re-renders with fresh data.
  const handleScoresChange = useCallback((newScores) => {
    liveScoresRef.current = newScores;
    setLiveScores(newScores);
  }, []);

  // Check if there's a backup available
  const hasBackup = roundId && (sessionStorage.getItem(`liveScores_${roundId}`) || localStorage.getItem(`liveScores_backup_${roundId}`));
  
  // Get backup data for display
  const backupData = (() => {
    if (!roundId) return null;
    try {
      const saved = sessionStorage.getItem(`liveScores_${roundId}`) || localStorage.getItem(`liveScores_backup_${roundId}`);
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  })();

  const [scoreMode, setScoreMode] = useState(() => {
    try { return sessionStorage.getItem(`scoreMode_${roundIdFromUrl}`) || 'tap'; } catch { return 'tap'; }
  }); // 'tap' | 'type' | 'dictate'
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  // Group flow state — lifted here and persisted in sessionStorage so it survives mode switches
  const [selectedForGroup, setSelectedForGroup] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(`groupSelected_${roundIdFromUrl}`) || '[]'); } catch { return []; }
  });
  const [groupLockedPlayerIds, setGroupLockedPlayerIds] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(`groupLocked_${roundIdFromUrl}`) || 'null'); } catch { return null; }
  });
  const [completedPlayerIds, setCompletedPlayerIds] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(`groupCompleted_${roundIdFromUrl}`) || '[]'); } catch { return []; }
  });
  const [showVerify, setShowVerify] = useState(false);
  const debounceTimerRef = useRef(null);
  const pendingPlayersRef = useRef(null);
  const roundRef = useRef(null);
  const computeSucceededRef = useRef(false);
  // liveScoresRef: always holds the latest scores — written by handleScoresChange with zero re-renders
  const liveScoresRef = useRef(liveScores);
  // Cache of { player_id -> RoundScore.id } so saves skip the filter lookup after the first time
  const roundScoreCacheRef = useRef({});

  // Clear group state from sessionStorage when the round changes
  useEffect(() => {
    // Only clear if this is a genuinely new round (no existing stored state for it)
    // i.e. don't clear on remounts for the same round
    return () => {
      // intentionally empty — we keep state across unmounts for the same roundId
    };
  }, [roundIdFromUrl]);

  // Invalidate once on mount so returning from SetupWizard always gets fresh data
  const didInvalidateRef = useRef(false);
  useEffect(() => {
    if (roundId && !didInvalidateRef.current) {
      didInvalidateRef.current = true;
      queryClient.invalidateQueries({ queryKey: ["round", roundId] });
    }
  }, []);

  const { data: round, isLoading } = useQuery({
    queryKey: ["round", roundId],
    queryFn: async () => {
      const rounds = await base44.entities.Round.filter({ id: roundId });
      return rounds[0];
    },
    enabled: !!roundId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  // Scroll to the Lock Roster button when returning from Tournament Logistics.
  // Mount-only ([]) — depending on [round] tears down the interval on every
  // refetch (initial load, invalidate, realtime) before any tick can execute.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("scrollTo") !== "lockRoster") return;

    let done = false;
    const deadline = Date.now() + 10000;
    const interval = setInterval(() => {
      if (done) return;
      const lockBtn = document.querySelector('[data-lock-roster]');
      if (lockBtn) {
        done = true;
        clearInterval(interval);
        // Slight delay to let the roster layout settle after paint
        setTimeout(() => {
          lockBtn.scrollIntoView({ behavior: 'auto', block: 'center' });
          const rect = lockBtn.getBoundingClientRect();
          const targetY = window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2;
          window.scrollTo(0, Math.max(0, targetY));
        }, 50);
        const url = new URL(window.location.href);
        url.searchParams.delete("scrollTo");
        window.history.replaceState(null, "", url.toString());
      } else if (Date.now() >= deadline) {
        clearInterval(interval);
        const url = new URL(window.location.href);
        url.searchParams.delete("scrollTo");
        window.history.replaceState(null, "", url.toString());
      }
    }, 150);
    return () => clearInterval(interval);
  }, []);

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Round.update(roundId, data),
    // Do NOT invalidate cache on score saves — round data is huge and the realtime
    // broadcast strips the players field when oversize, corrupting the cache.
    onMutate: () => setIsSaving(true),
    onSuccess: () => setIsSaving(false),
    onError: (e) => {
      setIsSaving(false);
      toast.error("Save failed", { description: e.message });
    },
  });

  const computeMutation = useMutation({
    mutationFn: (data) => base44.entities.Round.update(roundId, data),
    onSuccess: async () => {
      computeSucceededRef.current = true;
      // Wait for the mutation to fully commit before navigating
      await new Promise(resolve => setTimeout(resolve, 500));
      navigate(`/Results?id=${roundId}`);
    },
    onError: (e) => toast.error("Save Error", { description: e.message }),
  });

  const switchMode = useCallback(async (mode) => {
    // Save current scroll position before switching
    const scrollY = window.scrollY;
    
    const currentLiveScores = liveScoresRef.current || liveScores;
    if (currentLiveScores && roundId) {
      try {
        // Always fetch fresh players from DB to avoid overwriting with a stale/truncated cache
        const freshRounds = await base44.entities.Round.filter({ id: roundId });
        if (!freshRounds || freshRounds.length === 0) {
          toast.error("Round not found", { description: "Please return to Dashboard and reload the round" });
          return;
        }
        const freshPlayers = freshRounds[0]?.players || round?.players || [];
        const updatedPlayers = freshPlayers.map(p => ({
          ...p,
          scores: (currentLiveScores[p.player_id] || p.scores || []).map(s => {
            if (s === null || s === undefined || s === 0 || s === '') return '';
            return String(s);
          }),
        }));
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        pendingPlayersRef.current = null;
        updateMutation.mutate({ players: updatedPlayers });
      } catch (e) {
        console.error('Switch mode save failed:', e);
        toast.error("Save failed", { description: "Round data may be corrupted. Return to Dashboard." });
      }
    }
    // Reset verify screen when switching modes
    setShowVerify(false);
    setScoreMode(mode);
    
    // Restore scroll position after mode switch
    setTimeout(() => {
      window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
    }, 50);
  }, [round, roundId, updateMutation]);

  // Persist scoreMode to sessionStorage so it survives remounts
  useEffect(() => {
    if (!roundIdFromUrl) return;
    try { sessionStorage.setItem(`scoreMode_${roundIdFromUrl}`, scoreMode); } catch {}
  }, [scoreMode, roundIdFromUrl]);

  // Persist summary view preference (individual vs team)
  useEffect(() => {
    if (!roundIdFromUrl) return;
    try { sessionStorage.setItem(`summaryView_${roundIdFromUrl}`, summaryView); } catch {}
  }, [summaryView, roundIdFromUrl]);

  // Persist group flow state to sessionStorage so mode switches don't reset it
  useEffect(() => {
    if (!roundIdFromUrl) return;
    try { sessionStorage.setItem(`groupSelected_${roundIdFromUrl}`, JSON.stringify(selectedForGroup)); } catch {}
  }, [selectedForGroup, roundIdFromUrl]);
  useEffect(() => {
    if (!roundIdFromUrl) return;
    try { sessionStorage.setItem(`groupLocked_${roundIdFromUrl}`, JSON.stringify(groupLockedPlayerIds)); } catch {}
  }, [groupLockedPlayerIds, roundIdFromUrl]);
  useEffect(() => {
    if (!roundIdFromUrl) return;
    try { sessionStorage.setItem(`groupCompleted_${roundIdFromUrl}`, JSON.stringify(completedPlayerIds)); } catch {}
  }, [completedPlayerIds, roundIdFromUrl]);

  // Keep refs in sync so flushPending always has latest data
  // Note: liveScoresRef is also written directly by handleScoresChange (no state update path)
  useEffect(() => { roundRef.current = round; }, [round]);

  // Note: liveScores backup to sessionStorage/localStorage is handled directly in TapScoreEntry on every tap
  // to avoid triggering a full Scorecard re-render on every score input.

  // Flush any pending debounced score save immediately
  // Also saves liveScores to RoundScore records (the primary store)
  const flushPending = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const currentRound = roundRef.current;
    if (pendingPlayersRef.current) {
      updateMutation.mutate(pendingPlayersRef.current);
      pendingPlayersRef.current = null;
    }
    // Only flush players with pending per-player saves — NEVER blanket-save all players.
    // A blanket save would overwrite DB X values for players who weren't touched, using
    // stale in-memory state that was initialized from sessionStorage before DB data loaded.
    if (currentRound?.status === "scoring") {
      Object.entries(pendingPlayerScoresRef.current).forEach(([playerId, scores]) => {
        if (playerSaveTimersRef.current[playerId]) {
          clearTimeout(playerSaveTimersRef.current[playerId]);
          delete playerSaveTimersRef.current[playerId];
        }
        savePlayerScore(roundId, playerId, scores, roundScoreCacheRef.current).catch(() => {});
      });
      pendingPlayerScoresRef.current = {};
    }
  }, [updateMutation, roundId]);

  // Load RoundScore records when round data first arrives — DB always wins (authoritative store)
  useEffect(() => {
    if (!round || !roundId || round.status !== "scoring") return;
    loadRoundScores(roundId).then(roundScoreMap => {
      if (Object.keys(roundScoreMap).length === 0) return;
      const countValid = arr => arr ? arr.filter(s => s !== '' && s !== null && s !== undefined && s !== 0).length : 0;
      
      // Overwrite sessionStorage with DB data so it never reverts to a stale value
      try {
        const current = JSON.parse(sessionStorage.getItem(`liveScores_${roundId}`) || '{}');
        let updated = false;
        Object.entries(roundScoreMap).forEach(([pid, dbScores]) => {
          if (countValid(dbScores) > 0) { current[pid] = dbScores; updated = true; }
        });
        if (updated) {
          sessionStorage.setItem(`liveScores_${roundId}`, JSON.stringify(current));
          localStorage.setItem(`liveScores_backup_${roundId}`, JSON.stringify(current));
        }
      } catch {}

      // Always restore from RoundScore on every mount — it's the authoritative store.
      // Drop the "only once" guard so returning to the Scorecard always shows saved scores.
      const snapshot = {};
      Object.entries(roundScoreMap).forEach(([pid, dbScores]) => {
        if (countValid(dbScores) > 0) snapshot[pid] = dbScores;
      });
      initialScoresRef.current = snapshot;
      initialScoresLoadedRef.current = true;

      // Update liveScores for ScoreSummary display only (not passed to score entry components)
      setLiveScores(prev => {
        const merged = { ...(prev || {}) };
        Object.entries(roundScoreMap).forEach(([pid, dbScores]) => {
          if (countValid(dbScores) > 0) { merged[pid] = dbScores; }
        });
        liveScoresRef.current = merged;
        return merged;
      });
      // Also force sessionStorage to match DB so stale X values never survive a reload
      try {
        const sessionKey = `liveScores_${roundId}`;
        const current = JSON.parse(sessionStorage.getItem(sessionKey) || '{}');
        Object.entries(roundScoreMap).forEach(([pid, dbScores]) => {
          if (countValid(dbScores) > 0) { current[pid] = dbScores; }
        });
        sessionStorage.setItem(sessionKey, JSON.stringify(current));
        localStorage.setItem(`liveScores_backup_${roundId}`, JSON.stringify(current));
      } catch {}
    });
  }, [round?.id]);

  // Scroll is handled in SmoothScoringLayout when groupLockedPlayerIds is set

  // Save before the page unloads, goes to background, or navigates away (SPA).
  // Without the unmount flush, debounced RoundScore saves are lost when the
  // user navigates to another page via React Router — the 2s timers fire after
  // unmount and the saves never reach the database.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        flushPending();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", flushPending);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", flushPending);
      flushPending();
    };
  }, [flushPending]);

  // Debounce timers per player for RoundScore saves (prevent 429 rate limit)
  const playerSaveTimersRef = useRef({});
  // Tracks which players have pending (unsaved) score changes — only these get flushed
  const pendingPlayerScoresRef = useRef({});

  // Save a single player's scores to their RoundScore record — debounced per player
  const handlePlayerScoreSave = useCallback((playerId, scores) => {
    if (!roundId || !playerId) return;
    // Track pending scores so flushPending only saves players who were actually edited
    pendingPlayerScoresRef.current[playerId] = [...scores];
    // Cancel any pending save for this player
    if (playerSaveTimersRef.current[playerId]) {
      clearTimeout(playerSaveTimersRef.current[playerId]);
    }
    // Schedule save after 2s of inactivity
    playerSaveTimersRef.current[playerId] = setTimeout(() => {
      delete pendingPlayerScoresRef.current[playerId];
      savePlayerScore(roundId, playerId, scores, roundScoreCacheRef.current)
        .catch(e => console.warn('RoundScore save skipped:', e.message));
    }, 2000);
  }, [roundId]);

  const handleScanComplete = (scores) => {
    console.log("Scan complete, scores:", scores);
    if (!scores || scores.length === 0) {
      toast.error("No scores detected. Please try again with better lighting.");
      setShowScanner(false);
      return;
    }
    setScannedData(scores);
    setShowScanner(false);
    setShowScanReview(true);
  };

  const handleScanSave = async (playerScores) => {
    setScanDebug({ step: 'Starting...', data: null });
    
    if (!playerScores || playerScores.length === 0) {
      toast.error("No scores to save");
      setShowScanReview(false);
      setScannedData(null);
      setScanDebug(null);
      return;
    }
    
    try {
      setScanDebug({ step: 'Validating player IDs...', data: { count: playerScores.length } });
      
      // Validate player IDs only for players with actual scores
      const missingIds = playerScores.filter(ps => {
        const playerId = ps.player_id || ps.playerId;
        const hasScores = ps.scores && ps.scores.some(s => s !== '' && s !== null && s !== undefined);
        return !playerId && hasScores;
      }).map(ps => ps.player_name || ps.playerName);
      
      if (missingIds.length > 0) {
        setScanDebug({ step: 'ERROR: Missing player IDs', data: { missing: missingIds, fullData: playerScores } });
        throw new Error(`Missing player IDs for: ${missingIds.join(', ')}. Please add these players to the roster first.`);
      }
      
      // Build latest scores map - merge with existing live scores for partial scans
      const latestScores = {};
      const completedIds = [];
      
      const playerDetails = [];
      playerScores.forEach(ps => {
        // CRITICAL: Use player_id from the modal (now properly set)
        const playerId = ps.player_id;
        const playerName = ps.player_name;
        
        if (!playerId) {
          console.warn('Skipping player with no player_id:', ps);
          return;
        }
        
        // CRITICAL: Ensure scores is exactly 18 elements, all strings
        let scoresArray = ps.scores;
        if (!Array.isArray(scoresArray) || scoresArray.length !== 18) {
          console.error('Invalid scores array for player:', { playerId, scoresArray });
          const tempScores = Array(18).fill('');
          if (Array.isArray(scoresArray)) {
            scoresArray.slice(0, 18).forEach((s, i) => {
              if (s !== null && s !== undefined && s !== '') {
                tempScores[i] = String(s);
              }
            });
          }
          scoresArray = tempScores;
        }
        
        // Normalize ALL scores to strings - this is critical for DB validation
        const normalized = scoresArray.map((s, idx) => {
          if (s === null || s === undefined || s === '' || s === 0 || s === '0') return '';
          const str = String(s).trim().toUpperCase();
          if (str === 'X') return 'X';
          const num = parseInt(str, 10);
          return (isNaN(num) || num < 1 || num > 20) ? '' : String(num);
        });
        
        console.log('Processing player:', { playerId, playerName, normalized });
        
        // Merge with existing scores for partial scans
        const existingScores = liveScoresRef.current?.[playerId] || Array(18).fill('');
        const merged = normalized.map((s, idx) => s !== '' ? s : (existingScores[idx] || ''));
        
        latestScores[playerId] = merged;
        playerDetails.push({
          playerId,
          playerName,
          scanType: ps.scanType || 'full',
          scoresCount: ps.scores?.length,
          validScores: merged.filter(s => s !== '').length
        });
        if (merged.every(s => s !== '')) {
          completedIds.push(playerId);
        }
      });
      
      setScanDebug({ step: 'Saving to database...', data: { players: playerDetails } });
      
      // Update live scores
      setLiveScores(prev => ({ ...prev, ...latestScores }));
      liveScoresRef.current = { ...liveScoresRef.current, ...latestScores };
      
      // Save to RoundScore records - ensure all scores are strings
      setIsSaving(true);
      const savePromises = Object.entries(latestScores).map(([playerId, scores]) => {
        // CRITICAL: Triple-check all scores are strings - convert numbers explicitly
        const stringScores = scores.map(s => {
          if (s === null || s === undefined) return '';
          if (s === '' || s === 0 || s === '0') return '';
          if (typeof s === 'number') return String(s);
          if (typeof s === 'string') return s;
          return String(s);
        });
        console.log('=== SAVING TO ROUNDSCORE ===', { playerId, stringScores, types: stringScores.map(s => typeof s) });
        return savePlayerScore(roundId, playerId, stringScores, roundScoreCacheRef.current);
      });
      
      await Promise.all(savePromises);
      
      setScanDebug({ step: 'SUCCESS! All scores saved.', data: { savedCount: playerScores.length } });
      
      // Update completed player IDs so the UI advances
      setCompletedPlayerIds(prev => {
        const updated = [...new Set([...prev, ...completedIds])];
        sessionStorage.setItem(`groupCompleted_${roundId}`, JSON.stringify(updated));
        return updated;
      });
      
      // Clear group selection so users can start fresh
      setSelectedForGroup([]);
      setGroupLockedPlayerIds(null);
      sessionStorage.setItem(`groupSelected_${roundId}`, JSON.stringify([]));
      sessionStorage.setItem(`groupLocked_${roundId}`, JSON.stringify(null));
      
      toast.success("Scores saved successfully");
      setTimeout(() => {
        setShowScanReview(false);
        setScannedData(null);
        setScanDebug(null);
      }, 1500);
    } catch (e) {
      toast.error("Failed to save scanned scores", { description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = useCallback((rawData) => {
    // ALWAYS preserve course_tee_sets from cached round on EVERY save to prevent losing ladies data
    const mergedData = {
      ...rawData,
      course_tee_sets: roundRef.current?.course_tee_sets || rawData.course_tee_sets
    };
    
    // Always normalize scores to strings before saving
    let data = mergedData;
    if (data?.players) {
      data = {
        ...data,
        players: data.players.map(p => ({
          ...p,
          scores: (p.scores || []).map(s => {
            if (s === null || s === undefined || s === 0 || s === '') return '';
            return String(s);
          })
        }))
      };
    }
    if (data?.computeResults) {
      handleCompute();
      return;
    }
    if (data?.players && !data._immediate) {
      // Debounced save — prevents 429 rate limit on rapid score taps
      pendingPlayersRef.current = data;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        if (pendingPlayersRef.current) {
          updateMutation.mutate(pendingPlayersRef.current);
          pendingPlayersRef.current = null;
        }
        debounceTimerRef.current = null;
      }, 2000);
    } else if (data?.players && data._immediate) {
      // Immediate save (e.g. roster changes) — flush any pending first
      if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null; }
      pendingPlayersRef.current = null;
      const { _immediate, ...saveData } = data;
      // Optimistically update cache — always preserve course_tee_sets from existing cache
      queryClient.setQueryData(["round", roundId], (old) => {
        if (!old) return old;
        const merged = { ...old, ...saveData };
        // Never let a player save overwrite course_tee_sets that are already in cache
        if (old.course_tee_sets && (!saveData.course_tee_sets || saveData.course_tee_sets === old.course_tee_sets)) {
          merged.course_tee_sets = old.course_tee_sets;
        }
        return merged;
      });
      updateMutation.mutateAsync(saveData).catch((e) => {
        toast.error("Failed to save roster", { description: e.message });
      });
    } else {
      // For non-player updates (status, kp_winners, player_count, etc.)
      // First flush any pending player score saves, then send the non-player update separately.
      // Do NOT merge them — merging pending players (which may be stale) with fresh config data
      // risks overwriting newer scores with old ones.
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        if (pendingPlayersRef.current) {
          // Save pending players first (fire-and-forget), then save the config update
          updateMutation.mutate(pendingPlayersRef.current);
          pendingPlayersRef.current = null;
        }
      }
      // Optimistically update cache so non-player changes (kp_winners, status, etc.)
      // are reflected immediately and survive navigation between roster/scoring views
      // without waiting for a refetch (which doesn't happen since the component doesn't unmount).
      queryClient.setQueryData(["round", roundId], (old) => old ? { ...old, ...data } : old);
      // Use mutateAsync for critical updates like kp_winners to ensure they complete
      updateMutation.mutateAsync(data).catch(() => {});
    }
  }, [updateMutation, queryClient, roundId]);

  const handleCompute = async () => {
    setComputeErrors(null);
    setIsComputing(true);
    
    // Cancel any pending debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingPlayersRef.current = null;

    // CRITICAL: Flush ALL pending RoundScore saves before computing
    // Cancel all per-player debounce timers and wait for them to complete
    const pendingSaves = [];
    Object.values(playerSaveTimersRef.current).forEach(timer => {
      if (timer) {
        clearTimeout(timer);
      }
    });
    playerSaveTimersRef.current = {};

    // Read latest scores from ref (not state — state may lag behind)
    const currentLiveScores = liveScoresRef.current || liveScores;
    if (currentLiveScores && roundId) {
      // Save ALL players' scores to RoundScore records immediately (no debounce)
      await saveAllScores(roundId, currentLiveScores, roundScoreCacheRef.current);
      
      // Also sync to Round.players as backup
      const preSaveFresh = await base44.entities.Round.filter({ id: roundId });
      const preSavePlayers = preSaveFresh[0]?.players || roundRef.current?.players || [];
      const updatedPlayersForSave = preSavePlayers.map(p => ({
        ...p,
        scores: (currentLiveScores[p.player_id] || p.scores || []).map(s => {
          if (s === null || s === undefined || s === 0 || s === '') return '';
          return String(s);
        })
      }));
      await updateMutation.mutateAsync({ players: updatedPlayersForSave });
    }
    
    // Wait for any other in-flight mutations (KP updates, etc.)
    while (updateMutation.isPending) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Additional buffer for server consistency
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Fetch fresh round data directly from DB (bypass cache entirely — don't use removeQueries
    // which can trigger an oversize realtime broadcast that clears the players field)
    const freshRounds = await base44.entities.Round.filter({ id: roundId });
    const freshRound = freshRounds[0];
    
    // Load RoundScore records — these are the authoritative source (no size limit)
    const roundScoreMap = await loadRoundScores(roundId);

    // Fall back chain: RoundScore > liveScores > sessionStorage
    let sessionScores = null;
    try {
      const raw = sessionStorage.getItem(`liveScores_${roundId}`);
      if (raw) sessionScores = JSON.parse(raw);
    } catch {}

    const countValid = arr => arr ? arr.filter(s => s !== '' && s !== null && s !== undefined && s !== 0).length : 0;
    const scoresToUse = {};
    (freshRound.players || []).forEach(p => {
      const fromRoundScore = roundScoreMap[p.player_id];
      const fromLive = liveScoresRef.current?.[p.player_id];
      const fromSession = sessionScores?.[p.player_id];
      const fromDb = p.scores;
      console.log(`Player ${p.name}: RoundScore=${fromRoundScore?.filter(s=>s!==0).length||0}, live=${fromLive?.filter(s=>s!==0).length||0}, session=${fromSession?.filter(s=>s!==0).length||0}, db=${fromDb?.filter(s=>s!==0).length||0}`);
      // Pick best source - prioritize RoundScore, then live, then session, then db
      if (fromRoundScore && countValid(fromRoundScore) > 0) {
        scoresToUse[p.player_id] = fromRoundScore;
      } else if (fromLive && countValid(fromLive) > 0) {
        scoresToUse[p.player_id] = fromLive;
      } else if (fromSession && countValid(fromSession) > 0) {
        scoresToUse[p.player_id] = fromSession;
      } else if (fromDb && countValid(fromDb) > 0) {
        scoresToUse[p.player_id] = fromDb;
      }
    });

    // Helper: pick the best available score array for a player
    // RoundScore (via scoresToUse) is authoritative — never fall back to achievement reconstruction
    // which would overwrite manually edited scores with stale derived values.
    const getBestScores = (p) => {
      const live = scoresToUse[p.player_id];
      const db = p.scores || [];
      const countValid = arr => arr ? arr.filter(s => s !== '' && s !== null && s !== undefined && s !== 0).length : 0;
      // Prefer whichever has more valid scores (RoundScore vs Round.players)
      return countValid(live) >= countValid(db) ? (live || db) : db;
    };

    const roundWithLiveScores = {
      ...freshRound,
      players: freshRound.players.map(p => ({
        ...p,
        scores: getBestScores(p),
      })),
      kp_winners: freshRound.kp_winners || [],
      kp_holes: freshRound.kp_holes || [],
    };
    
    console.log('=== SCORES MERGED FOR COMPUTE ===');
    roundWithLiveScores.players.forEach(p => {
      console.log(`${p.name}: ${p.scores?.filter(s=>s!==0&&s!=='').length||0} valid scores`);
    });

    let result;
    try {
      result = computeResults(roundWithLiveScores);
    } catch (e) {
      console.error('Compute error full:', e);
      toast.error("Compute Error", { description: e.message });
      setIsComputing(false);
      return;
    }

    if (!result.success) {
      setComputeErrors(result.issues);
      toast.error("Validation Failed");
      setIsComputing(false);
      return;
    }

    const updatedPlayers = roundWithLiveScores.players.map(p => ({
      ...p,
      scores: p.scores.map(s => {
        if (typeof s === 'string' && s.length > 0) return s;
        return String(s || '');
      })
    }));
    computeMutation.mutate({ players: updatedPlayers, results: result.results, status: "completed" });
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 pb-20">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
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

  const isValidScore = s => {
    if (s === null || s === undefined || s === '') return false;
    const str = String(s).trim().toUpperCase();
    if (str === 'X') return true;
    const num = parseInt(str, 10);
    return !isNaN(num) && num >= 1 && num <= 20;
  };
  const allScoresComplete = round.players?.length > 0 &&
    round.players.every(p => {
      const scores = liveScores?.[p.player_id] || p.scores;
      if (!scores || scores.length !== 18) return false;
      const validCount = scores.filter(s => isValidScore(s)).length;
      return validCount === 18;
    });

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20 sm:pb-0">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <PageDescription
           title={round.event_name}
           description={round.status === "roster" 
             ? "Add players to the round and configure their tee preferences. If your course already has par and handicap information saved, you only need to add players."
             : "Select the way you want to enter the scores, select player or players that you are scoring, then enter scores."
           }
         />

        {/* Phase: Roster */}
        {round.status === "roster" && (
          <div className="space-y-4">
            <Button variant="ghost" onClick={() => navigate(`/SetupWizard?id=${roundId}`)} className="gap-2 mb-4">
              <ChevronLeft className="w-4 h-4" /> Back to Setup
            </Button>
            {round.course_id ? (
              <div className="p-3 bg-muted/50 rounded-lg border border-border">
                <p className="text-sm text-muted-foreground">
                  <strong>{round.course_name}</strong> - {round.tee_set} tees (Slope: {round.slope}, Rating: {round.rating})
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Course data is locked. Edit in <strong>Courses Management</strong>.
                </p>
              </div>
            ) : null}
            <div className="tour-scorecard-roster">
              <PlayerRoster round={round} onUpdate={handleUpdate} />
            </div>
          </div>
        )}

        {/* Phase: Completed - View Scores */}
        {round.status === "completed" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => navigate(`/Results?id=${roundId}`)}
                className="gap-2"
              >
                View Full Results →
              </Button>
            </div>
            
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-lg font-semibold mb-4">Scorecard - {round.event_name}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 font-medium">Player</th>
                      {Array.from({ length: 9 }, (_, i) => (
                        <th key={i} className="text-center py-2 px-1 font-medium w-8">{i + 1}</th>
                      ))}
                      <th className="text-center py-2 px-1 font-medium">OUT</th>
                      {Array.from({ length: 9 }, (_, i) => (
                        <th key={i + 9} className="text-center py-2 px-1 font-medium w-8">{i + 10}</th>
                      ))}
                      <th className="text-center py-2 px-1 font-medium">IN</th>
                      <th className="text-center py-2 px-2 font-bold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {round.results?.gross_results?.map((result) => {
                      const par = round.par || [];
                      // Prefer actual saved scores from Round.players over achievement-derived scores
                      const playerData = round.players?.find(p => p.player_id === result.player_id);
                      // Always use Round.players scores — never reconstruct from achievements
                      const scores = (playerData?.scores || []).map(s => s === 'X' ? 'X' : (parseInt(s) || 0));
                      
                      const front9 = scores.slice(0, 9).reduce((a, b) => a + (b || 0), 0);
                      const back9 = scores.slice(9, 18).reduce((a, b) => a + (b || 0), 0);
                      const total = front9 + back9;
                      
                      return (
                        <tr key={result.player_id} className="border-b border-border last:border-0">
                          <td className="py-2 px-2 font-medium text-sm">{result.name}</td>
                          {scores.slice(0, 9).map((score, i) => (
                            <td key={i} className="text-center py-2 px-1 text-xs">{score || '-'}</td>
                          ))}
                          <td className="text-center py-2 px-1 font-semibold text-xs">{front9}</td>
                          {scores.slice(9, 18).map((score, i) => (
                            <td key={i + 9} className="text-center py-2 px-1 text-xs">{score || '-'}</td>
                          ))}
                          <td className="text-center py-2 px-1 font-semibold text-xs">{back9}</td>
                          <td className="text-center py-2 px-2 font-bold">{total}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Phase: Scoring */}
        {round.status === "scoring" && (
          <div className="space-y-4">

            {/* Backup restore alert - shown when backup exists */}
            {backupData && round.players && (
              <div className="bg-muted border border-border rounded-lg px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">Saved scores available.</p>
                <button
                  type="button"
                  onClick={() => {
                    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                    pendingPlayersRef.current = null;
                    setLiveScores(backupData);
                    setTimeout(() => {
                      document.querySelector('.tour-tap-scoring')?.scrollIntoView({ behavior: 'smooth' });
                    }, 100);
                    toast.success("Scores restored.");
                  }}
                  className="text-sm font-medium text-primary hover:underline shrink-0"
                >
                  Restore
                </button>
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              <Button
                variant="edit"
                onClick={() => {
                  // Flush debounce and save live scores + status together so no scores are lost
                  if (debounceTimerRef.current) {
                    clearTimeout(debounceTimerRef.current);
                    debounceTimerRef.current = null;
                  }
                  pendingPlayersRef.current = null;
                  const latestScores = liveScoresRef.current || liveScores;
                  const updatedPlayers = latestScores && round?.players
                    ? round.players.map(p => ({
                        ...p,
                        scores: (latestScores[p.player_id] || p.scores || []).map(s => {
                          if (s === null || s === undefined || s === 0 || s === '') return '';
                          return String(s);
                        })
                      }))
                    : round?.players;
                  // Optimistically update cache so the UI transitions immediately
                  // (the realtime broadcast is oversize and will corrupt the cache)
                  queryClient.setQueryData(["round", roundId], (old) => old ? { ...old, players: updatedPlayers, status: "roster" } : old);
                  updateMutation.mutate({ players: updatedPlayers, status: "roster" });
                }}
                className="gap-2"
              >
                <ChevronLeft className="w-4 h-4" /> Edit Roster
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  // Flush any pending score saves before navigating so Results sees the latest scores
                  flushPending();
                  await new Promise(resolve => setTimeout(resolve, 600));
                  navigate(`/Results?id=${roundId}`);
                }}
                className="gap-2"
              >
                View Results →
              </Button>
              <Button
                variant="secondary"
                onClick={() => navigate('/TournamentLogistics')}
                className="gap-2 bg-logistics text-logistics-foreground hover:bg-logistics/90"
              >
                Tournament Logistics
              </Button>
              <ScorecardPrintButton round={round} className="bg-accent text-accent-foreground hover:bg-accent/90" />
            </div>

            {(round.deuce_pot_enabled || (round.kps_enabled && round.kp_separate_buy_in) || (round.gross_skins_enabled && round.gross_skins_separate_buy_in) || (round.net_skins_enabled && round.net_skins_separate_buy_in)) && (
              <SideGamePlayers round={round} onUpdate={handleUpdate} />
            )}

            {/* Score entry mode toggle */}
            <div className="sticky top-0 z-10 -mx-4 px-4 pt-2 pb-2 bg-background tour-scoring-modes">
              <div className="flex items-center gap-2 p-1 bg-muted rounded-xl">
                {[['tap', 'Tap', Hand], ['type', 'Type', Keyboard], ['dictate', 'Dictate', Mic], ['scan', 'Scan', Camera]].map(([mode, label, Icon]) => (
                  <button
                    key={mode}
                    onClick={() => switchMode(mode)}
                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      scoreMode === mode ? 'bg-white shadow text-primary' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Mode instructions — NOT sticky so they don't push buttons off screen */}
            {scoreMode === 'tap' && (
              <div className="p-4 bg-primary/10 border border-primary/30 rounded-lg text-sm text-white">
                <strong className="text-primary font-bold">Tap:</strong> Select player(s), press Start Scorecard, then tap scores. Use the player selector to switch players.
              </div>
            )}
            {scoreMode === 'type' && (
              <div className="p-4 bg-primary/10 border border-primary/30 rounded-lg text-sm text-white">
                <strong className="text-primary font-bold">Type:</strong> Select player(s), press Start Scorecard, then type scores. Use the player selector to switch players.
              </div>
            )}
            {scoreMode === 'dictate' && (
              <div className="p-4 bg-primary/10 border border-primary/30 rounded-lg text-sm text-white">
                <strong className="text-primary font-bold">Dictate:</strong> Select player(s), press Start Scorecard, then dictate all 18 scores (e.g., "4, 3, 4, 5..."). Correct mistakes afterward.
              </div>
            )}
            {scoreMode === 'scan' && (
              <div className="p-4 bg-primary/10 border border-primary/30 rounded-lg text-sm text-white space-y-2">
                <div>
                  <strong className="text-primary font-bold">Scan:</strong> Take a photo of a physical scorecard. The app reads player names and scores automatically and matches them to your roster — no need to select players first. Review and save after scanning.
                </div>
                <div className="flex items-start gap-2 pt-1 border-t border-primary/20">
                  <span className="text-base shrink-0">💡</span>
                  <p className="text-xs text-white/80 leading-relaxed">
                    <strong className="text-primary">Tip:</strong> Swift Score Golf scorecards work best for scanning. Other card layouts may not be read accurately.
                  </p>
                </div>
              </div>
            )}



            {scoreMode === 'tap' ? (
              <div className="tour-tap-scoring">
                <TapScoreEntry round={round} onUpdate={handleUpdate} onScoresChange={handleScoresChange} switchMode={() => switchMode('type')} initialScores={initialScoresRef.current || liveScores} selectedPlayerId={selectedPlayerId} onPlayerSelect={setSelectedPlayerId}
                  selectedForGroup={selectedForGroup} onSelectedForGroupChange={setSelectedForGroup}
                  groupLockedPlayerIds={groupLockedPlayerIds} onGroupLocked={setGroupLockedPlayerIds}
                  completedPlayerIds={completedPlayerIds} onCompletedChange={setCompletedPlayerIds}
                  showVerify={showVerify} onShowVerifyChange={setShowVerify}
                  onPlayerScoreSave={handlePlayerScoreSave}
                  isEditing={round.status === "completed"}
                />
              </div>
            ) : scoreMode === 'scan' ? (
              <div className="flex flex-col items-center justify-center gap-4 py-12 bg-card border border-border rounded-xl">
                <Camera className="w-12 h-12 text-primary" />
                <p className="text-sm text-muted-foreground text-center max-w-xs">
                  Take a photo of your physical scorecard. We'll automatically read player names and scores, then match them to your roster.
                </p>
                <Button onClick={() => setShowScanner(true)} className="gap-2" size="lg">
                  <Camera className="w-4 h-4" />
                  Scan Scorecard
                </Button>
              </div>
            ) : (
              <div className="tour-tap-scoring">
                <ScoreEntry round={round} onUpdate={handleUpdate} onScoresChange={handleScoresChange} switchMode={() => switchMode('tap')} initialScores={initialScoresRef.current || liveScores} dictateOnly={scoreMode === 'dictate'} selectedPlayerId={selectedPlayerId} onPlayerSelect={setSelectedPlayerId}
                  selectedForGroup={selectedForGroup} onSelectedForGroupChange={setSelectedForGroup}
                  groupLockedPlayerIds={groupLockedPlayerIds} onGroupLocked={setGroupLockedPlayerIds}
                  completedPlayerIds={completedPlayerIds} onCompletedChange={setCompletedPlayerIds}
                  showVerify={showVerify} onShowVerifyChange={setShowVerify}
                  onPlayerScoreSave={handlePlayerScoreSave}
                  isEditing={round.status === "completed"}
                />
              </div>
            )}
            {round.kps_enabled && <div className="tour-kp-entry"><KPEntry round={round} onUpdate={handleUpdate} /></div>}
            {/* Individual vs Team toggle — only for team format rounds */}
            {round.team_mode && (
              <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
                <button
                  type="button"
                  onClick={() => setSummaryView('individual')}
                  className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
                    summaryView === 'individual' ? 'bg-white shadow text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Individual
                </button>
                <button
                  type="button"
                  onClick={() => setSummaryView('team')}
                  className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
                    summaryView === 'team' ? 'bg-white shadow text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Team
                </button>
              </div>
            )}
            {round.team_mode && summaryView === 'team' ? (
              <TeamScoreSummary
                round={round}
                roundId={roundId}
                liveScores={liveScores}
                onEditModeChange={setScoreSummaryEditing}
                onScoresChange={async (newScores) => {
                  setLiveScores(prev => ({ ...(prev || {}), ...newScores }));
                  liveScoresRef.current = { ...(liveScoresRef.current || {}), ...newScores };
                  // Persist to sessionStorage + localStorage so returning to the
                  // page shows the latest scores instantly (before loadRoundScores
                  // fetches from RoundScore — the authoritative store).
                  try {
                    const merged = { ...(liveScoresRef.current || {}), ...newScores };
                    sessionStorage.setItem(`liveScores_${roundId}`, JSON.stringify(merged));
                    localStorage.setItem(`liveScores_backup_${roundId}`, JSON.stringify(merged));
                  } catch {}
                  setIsSaving(true);
                  try {
                    await Promise.all(
                      Object.entries(newScores).map(([playerId, scores]) =>
                        savePlayerScore(roundId, playerId, scores, roundScoreCacheRef.current)
                      )
                    );
                  } finally {
                    setIsSaving(false);
                  }
                }}
              />
            ) : (
              <ScoreSummary
                round={round}
                roundId={roundId}
                liveScores={liveScores}
                onEditModeChange={setScoreSummaryEditing}
                onScoresChange={async (newScores) => {
                  // Update local state immediately so UI reflects changes right away
                  setLiveScores(prev => ({ ...(prev || {}), ...newScores }));
                  liveScoresRef.current = { ...(liveScoresRef.current || {}), ...newScores };
                  // Persist to sessionStorage + localStorage so returning to the
                  // page shows the latest scores instantly.
                  try {
                    const merged = { ...(liveScoresRef.current || {}), ...newScores };
                    sessionStorage.setItem(`liveScores_${roundId}`, JSON.stringify(merged));
                    localStorage.setItem(`liveScores_backup_${roundId}`, JSON.stringify(merged));
                  } catch {}
                  // Save IMMEDIATELY and directly to RoundScore — no debounce, no Round.players merge
                  // This is the most reliable path on Android where debounced saves get interrupted
                  setIsSaving(true);
                  try {
                    await Promise.all(
                      Object.entries(newScores).map(([playerId, scores]) =>
                        savePlayerScore(roundId, playerId, scores, roundScoreCacheRef.current)
                      )
                    );
                  } finally {
                    setIsSaving(false);
                  }
                }}
              />
            )}

            {round.game_mode === "SWIFT_SCORE_11" && round.player_count < 6 && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
                ⚠️ Fixed Payouts mode requires at least 6 players. Please go back and adjust the roster.
              </div>
            )}
            {scoreSummaryEditing && (
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-300 rounded-lg px-4 py-3">
                ⚠️ Save or cancel your score edits above before computing results.
              </div>
            )}
            {computeErrors && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 space-y-1">
                <p className="font-semibold">⚠️ Cannot compute results:</p>
                {computeErrors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              {isSaving && (
                <div className="flex items-center gap-2 text-sm text-primary">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </div>
              )}
              {!isSaving && liveScores && (
                <div className="text-sm text-green-600 flex items-center gap-1">
                  ✓ All scores saved
                </div>
              )}
            </div>
            <Button
              size="lg"
              className="w-full gap-2 shadow-lg shadow-primary/20 tour-compute-results"
              onClick={handleCompute}
              disabled={isComputing || scoreSummaryEditing || (round.game_mode === "SWIFT_SCORE_11" && round.player_count < 6)}
            >
              {isComputing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Calculator className="w-4 h-4" />
              )}
              {isComputing ? "Computing..." : "Compute Results"}
            </Button>
          </div>
        )}
      </motion.div>

      {/* OCR Scanner Modal */}
      {showScanner && (
        <ScorecardScanner
          round={round}
          onScanComplete={handleScanComplete}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Scan Review Modal */}
      {showScanReview && scannedData && (
        <ScanReviewModal
          isOpen={showScanReview}
          onClose={() => {
            setShowScanReview(false);
            setScannedData(null);
            setScanDebug(null);
          }}
          onSave={handleScanSave}
          scannedData={scannedData}
          round={round}
        />
      )}

      {/* Scan Debug Display */}
      {scanDebug && (
        <div className="fixed bottom-4 left-4 right-4 bg-black/90 text-white text-xs p-3 rounded-lg z-50 max-h-48 overflow-auto">
          <p className="font-bold text-primary mb-2">Scan Debug: {scanDebug.step}</p>
          {scanDebug.data && (
            <pre className="whitespace-pre-wrap break-all">
              {JSON.stringify(scanDebug.data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}