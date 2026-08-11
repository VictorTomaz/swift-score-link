import React, { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Mic, MicOff, Loader2, Zap, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import ScorecardGroupFlow from "@/components/scorecard/ScorecardGroupFlow";
import { isSingleTeamScoreFormat, getTeamOfPlayer } from "@/lib/teamScoreEntry";

// Safeguard: store round in sessionStorage to prevent data loss
const getRoundFromStorage = (roundId) => {
  try {
    const stored = sessionStorage.getItem(`round_${roundId}`);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

const saveRoundToStorage = (roundId, round) => {
  try {
    sessionStorage.setItem(`round_${roundId}`, JSON.stringify(round));
  } catch {
    // Storage limit exceeded, ignore silently
  }
};

export default function ScoreEntry({ round, onUpdate, onScoresChange, switchMode, initialScores, dictateOnly = false, selectedPlayerId: externalSelectedPlayerId, onPlayerSelect,
  selectedForGroup, onSelectedForGroupChange, groupLockedPlayerIds, onGroupLocked, completedPlayerIds, onCompletedChange, showVerify, onShowVerifyChange, onPlayerScoreSave }) {
  const scoreMode = dictateOnly ? 'dictate' : 'type';

  const urlParams = new URLSearchParams(window.location.search);
   const roundId = urlParams.get("id");
   const [currentHole, setCurrentHole] = useState(0);

   // Safeguard: if round players empty, try to restore from sessionStorage
   let players = round.players || [];
   if (!players.length && roundId) {
     const stored = getRoundFromStorage(roundId);
     if (stored?.players?.length) {
       players = stored.players;
     }
   }

   // Save round to storage whenever it changes and has players
   useEffect(() => {
     if (roundId && round.players?.length) {
       saveRoundToStorage(roundId, round);
     }
   }, [roundId, round]);
   const par = round.par || new Array(18).fill(4);
   const isTeamScore = isSingleTeamScoreFormat(round);

  const [selectedPlayerId, setSelectedPlayerIdLocal] = useState(externalSelectedPlayerId || "");
  const setSelectedPlayerId = (id) => {
    setSelectedPlayerIdLocal(id);
    onPlayerSelect?.(id);
    // Reset dictation state when switching players
    setTranscript('');
    accumulatedTranscriptRef.current = '';
    shouldRestartRef.current = false;
    isListeningRef.current = false;
    setIsListening(false);
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
  };
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const recognitionRef = useRef(null);
  const gridAdvanceTimers = useRef({});
  const gridLocalValues = useRef({});
  const holeAdvanceTimers = useRef({});

  // Group flow state — all managed in parent via props (no local shadow copies)
  const setGroupLockedPlayerIds = onGroupLocked || (() => {});
  const setShowVerify = onShowVerifyChange || (() => {});

  const isListeningRef = useRef(false);
  const accumulatedTranscriptRef = useRef('');
  const shouldRestartRef = useRef(false);

  const isAndroid = () => /android/i.test(navigator.userAgent);



  // Ref so onend closure can access current selectedPlayerId
  const selectedPlayerIdRef = useRef(selectedPlayerId);
  useEffect(() => { selectedPlayerIdRef.current = selectedPlayerId; }, [selectedPlayerId]);

  // Ref to track how many scores were already applied before this recognition session
  const appliedScoreCountRef = useRef(0);

  const createAndStartRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const android = isAndroid();
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    let sessionText = '';

    recognition.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          sessionText += result[0].transcript.trim() + ' ';
          // On Android: accumulate into the shared ref so all sessions build one transcript
          if (android) accumulatedTranscriptRef.current += result[0].transcript.trim() + ' ';
        }
      }
      // Show live preview — accumulated so far
      const display = android
        ? accumulatedTranscriptRef.current.trim()
        : sessionText.trim();
      setTranscript(display);
    };

    recognition.onerror = (e) => {
      if (e.error === 'audio-capture') {
        toast.error("Microphone access issue. Check permissions.");
        shouldRestartRef.current = false; isListeningRef.current = false; setIsListening(false);
      } else if (e.error === 'not-allowed') {
        toast.error("Microphone permission denied. Enable in settings.");
        shouldRestartRef.current = false; isListeningRef.current = false; setIsListening(false);
      }
    };

    recognition.onend = () => {
      sessionText = '';

      if (!isListeningRef.current) {
        setIsListening(false);
        return;
      }

      // Android: just restart — scores are parsed from accumulated transcript when user taps Stop
      if (android) {
        isListeningRef.current = true;
        setTimeout(() => {
          if (shouldRestartRef.current) {
            createAndStartRecognition();
          }
        }, 150);
        return;
      }

      if (shouldRestartRef.current) {
        setTimeout(() => {
          if (shouldRestartRef.current && isListeningRef.current) {
            createAndStartRecognition();
          }
        }, 0);
      } else {
        setIsListening(false);
      }
    };

    recognition.start();
  };

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { toast.error("Voice input not supported in this browser."); return; }
    appliedScoreCountRef.current = 0;
    accumulatedTranscriptRef.current = '';
    setTranscript('');
    isListeningRef.current = true;
    shouldRestartRef.current = isAndroid();
    setIsListening(true);
    createAndStartRecognition();
  };

  const stopListening = () => {
    shouldRestartRef.current = false;
    isListeningRef.current = false;
    setIsListening(false);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    // Android: parse the full accumulated transcript now and save
    if (isAndroid() && accumulatedTranscriptRef.current.trim()) {
      const fullText = accumulatedTranscriptRef.current.trim();
      const parsed = parseScoresFromText(fullText);
      const pid = selectedPlayerId;
      if (parsed.length > 0 && pid) {
        const scores18 = parsed.slice(0, 18);
        let updatedScores;
        setScores(prev => {
          const existing = new Array(18).fill(0);
          scores18.forEach((s, i) => { existing[i] = s; });
          updatedScores = existing;
          const team = isTeamScore ? getTeamOfPlayer(round, pid) : null;
          const updated = { ...prev };
          const ids = team ? team.memberIds : [pid];
          ids.forEach(tid => { updated[tid] = [...existing]; });
          return updated;
        });
        // Save immediately
        if (updatedScores) {
          const normalized = updatedScores.map(s => (s === 0 ? '' : String(s)));
          import("@/lib/roundScores").then(({ savePlayerScore }) => {
            const urlP = new URLSearchParams(window.location.search);
            const rId = urlP.get("id");
            if (rId) {
              const team = isTeamScore ? getTeamOfPlayer(round, pid) : null;
              const ids = team ? team.memberIds : [pid];
              ids.forEach(tid => savePlayerScore(rId, tid, normalized, {}));
            }
          });
        }
        if (parsed.length >= 18) {
          setTranscript('');
          setTimeout(() => setShowVerify(true), 200);
        }
      }
      accumulatedTranscriptRef.current = '';
    }
  };

  const preprocessTranscript = (text) => {
    const wordToNum = {
      'eighteen': '18', 'seventeen': '17', 'sixteen': '16', 'fifteen': '15',
      'fourteen': '14', 'thirteen': '13', 'twelve': '12', 'eleven': '11', 'ten': '10',
      'nine': '9', 'eight': '8', 'seven': '7', 'six': '6', 'five': '5',
      'four': '4', 'three': '3', 'two': '2', 'one': '1', 'ace': '1', 'uno': '1',
      'forty': '4', 'fourty': '4', 'zero': '0'
    };

    // Helper: split a digit/X run into scores.
    // Greedily reads 2-digit numbers (10-20) first, then single digits.
    const splitDigitRun = (token) => {
      const parts = [];
      const str = token.toUpperCase();
      let i = 0;
      while (i < str.length) {
        if (str[i] === 'X') { parts.push('X'); i++; continue; }
        // Try to read a 2-digit number
        if (i + 1 < str.length && /\d/.test(str[i]) && /\d/.test(str[i+1])) {
          const two = parseInt(str[i] + str[i+1], 10);
          if (two >= 10 && two <= 20) { parts.push(String(two)); i += 2; continue; }
        }
        if (/\d/.test(str[i])) { parts.push(str[i]); i++; continue; }
        i++;
      }
      return parts;
    };

    // Replace hyphens/dashes with spaces
    let processed = text.toLowerCase().replace(/[-–—]/g, ' ');
    const tokens = processed.split(/\s+/).filter(t => t.length > 0);
    const result = [];

    for (let i = 0; i < tokens.length; i++) {
      // Strip ALL non-alphanumeric characters (handles punctuation, invisible chars from STT)
      const token = tokens[i].replace(/[^a-z0-9]/g, '');
      if (!token) continue;

      // Word number (handles "fourteen", "ten", "hole in one", etc.)
      if (wordToNum[token] !== undefined) {
        result.push(wordToNum[token]);
        continue;
      }

      // DQ / X variations (pure word)
      if (['x', 'ex', 'out', 'disqualified'].includes(token)) {
        result.push('X');
        continue;
      }

      // Single digit — accept as-is
      if (/^\d$/.test(token)) {
        result.push(token);
        continue;
      }

      // Any digit run of 2+ digits — always split digit-by-digit.
      // Double-digit scores (10-20) must be spoken as words ("ten", "eleven", etc.)
      if (/^[0-9xX]+$/i.test(token)) {
        splitDigitRun(token).forEach(p => result.push(p));
        continue;
      }

      // Ignore non-numeric non-word tokens (filler words, punctuation)
    }

    return result.join(' ');
  };

  // Parse text into scores array — used by both manual Apply and auto-apply
  const parseScoresFromText = (text) => {
    const cleaned = preprocessTranscript(text);
    const tokens = cleaned.split(/\s+/).filter(t => t.length > 0);
    const parsed = [];
    for (const token of tokens) {
      if (token.toUpperCase() === 'X') parsed.push('X');
      else { const num = parseInt(token, 10); if (!isNaN(num) && num >= 1 && num <= 20) parsed.push(num); }
    }
    return parsed;
  };

  const parseTranscript = () => {
    setIsParsing(true);
    if (!selectedPlayerId) { toast.error('Please select a player first.'); setIsParsing(false); return; }
    // Strip "[N scores saved] Listening..." prefix if present
    const rawText = transcript.replace(/^\[\d+ scores saved\].*$/, '').trim();
    const parsed = parseScoresFromText(rawText);
    
    if (parsed.length === 0) { 
      toast.error('Could not extract any scores. Please try again.'); 
      setIsParsing(false); 
      return; 
    }

    console.log('Parsed scores:', parsed, 'Count:', parsed.length);
    
    const normalized = parsed.slice(0, 18);

    // Merge with existing scores — fill in zeros/empty slots with new values
    setScores(prev => {
      const existing = prev[selectedPlayerId] || new Array(18).fill(0);
      const merged = existing.map((s, i) => {
        // If we have a new score for this position, use it; otherwise keep existing
        if (i < normalized.length) return normalized[i];
        return s;
      });
      const team = isTeamScore ? getTeamOfPlayer(round, selectedPlayerId) : null;
      const updated = { ...prev };
      const ids = team ? team.memberIds : [selectedPlayerId];
      ids.forEach(tid => { updated[tid] = [...merged]; });
      return updated;
    });

    if (parsed.length >= 18) {
      toast.success('All 18 scores loaded!');
      setTranscript('');
      shouldRestartRef.current = false;
      isListeningRef.current = false;
      if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
      setIsListening(false);
      setTimeout(() => {
        setShowVerify(true);
        setIsParsing(false);
      }, 100);
    } else {
      // Partial — apply scores and clear transcript so user can continue speaking the rest
      const missing = 18 - parsed.length;
      toast(`${parsed.length}/18 scores applied. Say the last ${missing} score${missing > 1 ? 's' : ''} and tap Apply again.`, { icon: '🎙️' });
      setTranscript('');
      setIsParsing(false);
      // Keep mic running so user can immediately continue
      if (!isListening) startListening();
    }
  };

  const [scores, setScores] = useState(() => {
    const initial = {};
    players.forEach(p => {
      if (initialScores?.[p.player_id]) {
        initial[p.player_id] = initialScores[p.player_id].map(s => s === '' ? 0 : s);
      } else {
        initial[p.player_id] = (p.scores && p.scores.length > 0) ? [...p.scores] : new Array(18).fill(0);
      }
    });
    return initial;
  });

  useEffect(() => {
    const normalized = {};
    Object.entries(scores).forEach(([playerId, scoreArray]) => {
      normalized[playerId] = scoreArray.map(s => (s === 0 ? '' : s));
    });
    if (onScoresChange) onScoresChange(normalized);

    // PRIMARY: Save each player's scores to their own RoundScore record
    if (onPlayerScoreSave && selectedPlayerId) {
      const team = isTeamScore ? getTeamOfPlayer(round, selectedPlayerId) : null;
      const saveIds = team ? team.memberIds : [selectedPlayerId];
      for (const tid of saveIds) {
        const ps = normalized[tid];
        if (ps && ps.some(s => s !== '' && s !== null && s !== undefined)) {
          onPlayerScoreSave(tid, ps);
        }
      }
    }

    // BACKUP: Also keep Round.players in sync (for backward compatibility)
    const updatedPlayers = players.map(p => ({
      ...p,
      scores: (normalized[p.player_id] || new Array(18).fill('')).map(s =>
        (s === null || s === undefined || s === 0 || s === '') ? '' : String(s)
      ),
    }));
    onUpdate({ players: updatedPlayers });
  }, [scores]);

  const skipNextSyncRef = useRef(false);
  const hasSyncedRef = useRef(false);

  useEffect(() => {
    if (!hasSyncedRef.current && roundId && !initialScores) {
      const initial = {};
      players.forEach(p => {
        initial[p.player_id] = p.scores?.length === 18 ? [...p.scores] : new Array(18).fill(0);
      });
      setScores(initial);
      hasSyncedRef.current = true;
    } else if (initialScores) {
      hasSyncedRef.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  useEffect(() => { hasSyncedRef.current = false; }, [roundId]);



  const updateScore = (playerId, hole, val, advance = false) => {
    setScores(prev => {
      const next = { ...prev };
      const team = isTeamScore ? getTeamOfPlayer(round, playerId) : null;
      const targets = team ? team.memberIds : [playerId];
      const upper = String(val).toUpperCase();
      const cellVal = upper === "X" ? "X" : (!isNaN(Number(val)) && Number(val) > 0 ? Number(val) : 0);
      for (const tid of targets) {
        next[tid] = [...next[tid]];
        next[tid][hole] = cellVal;
      }
      // Check if this player now has all 18 holes filled
      const allFilled = next[playerId].every(s => s === "X" || (typeof s === "number" && s > 0));
      if (allFilled && hole === 17) {
        // Just finished hole 18 — show verification
        setTimeout(() => setShowVerify(true), 100);
        return next;
      }

      // Auto-advance hole when the selected player finishes a hole in type (grid) mode
      if (!dictateOnly && hole < 17 && advance) {
        const playerScore = next[playerId]?.[hole];
        const scored = playerScore === "X" || (typeof playerScore === "number" && playerScore > 0);
        if (scored) {
          setCurrentHole(h => h + 1);
        }
      }


      return next;
    });
  };

  const saveScores = (showToast = false) => {
    const updatedPlayers = players.map(p => ({
      ...p,
      scores: (scores[p.player_id] || new Array(18).fill('')).map(s => {
        if (s === null || s === undefined || s === 0 || s === '') return '';
        return String(s);
      }),
    }));
    onUpdate({ players: updatedPlayers, _immediate: true });
    if (showToast) toast.success('Scores saved!');
  };

  const allComplete = players.every(p =>
    scores[p.player_id]?.every(s => s === "X" || s > 0)
  );

  const getNineData = (playerId) => {
    const playerScores = scores[playerId] || new Array(18).fill(0);
    const isX = s => String(s).toUpperCase() === "X";
    const hasDQ = playerScores.some(isX);
    const sumNine = (arr) => {
      // If any hole in this nine is X, the nine total is null (show dash)
      if (arr.some(isX)) return null;
      const sum = arr.reduce((a, s) => {
        const n = Number(s);
        return a + (isNaN(n) ? 0 : n);
      }, 0);
      return sum > 0 ? sum : null;
    };
    const frontNine = sumNine(playerScores.slice(0, 9));
    const backNine = sumNine(playerScores.slice(9, 18));
    const total = (frontNine === null || backNine === null) ? null : frontNine + backNine;
    return { frontNine, backNine, total, hasDQ };
  };

  const handleVerified = (playerId) => {
    if (isTeamScore) {
      const team = getTeamOfPlayer(round, playerId);
      const ids = team ? team.memberIds : [playerId];
      const newCompleted = [...new Set([...completedPlayerIds, ...ids])];
      onCompletedChange(newCompleted);
      setShowVerify(false);
      const allPlayersComplete = newCompleted.length >= round.players.length;
      if (!allPlayersComplete) {
        onSelectedForGroupChange([]);
        setSelectedPlayerId(round.players[0]?.player_id || null);
        setCurrentHole(0);
      }
      return;
    }
    const newCompleted = [...completedPlayerIds, playerId];
    onCompletedChange(newCompleted);
    setShowVerify(false);
    const currentIndex = selectedForGroup.indexOf(playerId);
    const nextPlayerId = selectedForGroup[currentIndex + 1];
    if (nextPlayerId) {
      setSelectedPlayerId(nextPlayerId);
      setCurrentHole(0);
      // Scroll to dictate button for next player
      setTimeout(() => {
        const dictateButton = document.querySelector('[class*="gap-2 text-lg font-semibold py-6"]');
        if (dictateButton) {
          dictateButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    } else {
      // All players in this group done
      // Check if ALL players in the round are now complete
      const allPlayersComplete = newCompleted.length === round.players.length;
      if (allPlayersComplete) {
        // Don't reset - keep completed state and show warning banner
        // Scroll to compute results button at bottom (longer delay for banner to render)
        setTimeout(() => {
          const computeButton = document.querySelector('.tour-compute-results');
          if (computeButton) {
            computeButton.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }
        }, 1200);
      } else {
        // All players in this group done
        const allPlayersComplete = newCompleted.length === round.players.length;
        if (allPlayersComplete) {
          // All done — scroll to bottom of page
          setTimeout(() => window.scrollTo({ top: 99999, behavior: 'smooth' }), 600);
        } else {
          // Only reset if there are more players to score (next scorecard)
          onSelectedForGroupChange([]);
          setSelectedPlayerId(round.players[0]?.player_id || null);
          setCurrentHole(0);
        }
      }
    }
  };

  const generateDummyScores = () => {
    const newScores = {};
    players.forEach(p => {
      newScores[p.player_id] = Array.from({ length: 18 }, () => Math.floor(Math.random() * 4) + 3);
    });
    // 2% chance per hole that the group gets a deuce (assigned to one random player)
    const playerIds = players.map(p => p.player_id);
    for (let h = 0; h < 18; h++) {
      if (Math.random() < 0.10 && playerIds.length > 0) {
        const lucky = playerIds[Math.floor(Math.random() * playerIds.length)];
        newScores[lucky][h] = 2;
      }
    }
    setScores(newScores);
    skipNextSyncRef.current = true;
    const updatedPlayers = players.map(p => ({ ...p, scores: newScores[p.player_id].map(s => String(s)) }));
    onUpdate({ players: updatedPlayers });
    onScoresChange?.(newScores);
    toast.success("Dummy scores generated for all players");
  };

  const holePar = par[currentHole] || 4;

  const getScoreColor = (score, parVal) => {
    if (score === "X") return "text-destructive font-bold";
    if (!score || score === 0) return "";
    const diff = score - parVal;
    if (diff <= -2) return "text-yellow-600 font-bold";
    if (diff === -1) return "text-red-500 font-semibold";
    if (diff === 0) return "text-foreground font-medium";
    if (diff === 1) return "text-blue-500";
    return "text-blue-700";
  };

  const verifyTotals = (() => {
    const d = getNineData(selectedPlayerId);
    return { frontNine: d.frontNine, backNine: d.backNine, total: d.total, hasDQ: d.hasDQ };
  })();
  const verifyPlayerName = isTeamScore
    ? (getTeamOfPlayer(round, selectedPlayerId)?.label || "Team")
    : players.find(p => p.player_id === selectedPlayerId)?.name;

  if (showVerify && verifyTotals) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <Card className="border-0 shadow-lg w-full max-w-sm">
          <CardContent className="p-8 text-center space-y-6">
            <div>
              <p className="text-xl font-bold text-foreground">{verifyPlayerName}</p>
              <p className="text-sm text-muted-foreground">18 holes complete</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className={`rounded-lg p-4 ${verifyTotals.frontNine === null ? "bg-destructive/10" : "bg-secondary/40"}`}>
                <p className="text-xs text-muted-foreground">Front 9</p>
                <p className={`text-3xl font-bold ${verifyTotals.frontNine === null ? "text-destructive" : "text-foreground"}`}>
                  {verifyTotals.frontNine != null ? verifyTotals.frontNine : "X"}
                </p>
              </div>
              <div className={`rounded-lg p-4 ${verifyTotals.backNine === null ? "bg-destructive/10" : "bg-secondary/40"}`}>
                <p className="text-xs text-muted-foreground">Back 9</p>
                <p className={`text-3xl font-bold ${verifyTotals.backNine === null ? "text-destructive" : "text-foreground"}`}>
                  {verifyTotals.backNine != null ? verifyTotals.backNine : "X"}
                </p>
              </div>
              <div className={`rounded-lg p-4 ${verifyTotals.hasDQ ? "bg-destructive/10" : "bg-primary/10"}`}>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className={`text-3xl font-bold ${verifyTotals.hasDQ ? "text-destructive" : "text-primary"}`}>
                  {verifyTotals.hasDQ ? "DQ" : (verifyTotals.total != null ? verifyTotals.total : "—")}
                </p>
              </div>
            </div>
            {verifyTotals.hasDQ && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-md px-2 py-1 text-center">
                ⚠️ Player has X (DQ) on one or more holes — excluded from gross/net payouts
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => {
                setShowVerify(false);
                setTimeout(() => {
                  const scoresCard = document.querySelector('[data-all-scores]');
                  if (scoresCard) {
                    scoresCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }, 100);
              }}>Edit</Button>
              <Button className="flex-1" onClick={() => handleVerified(selectedPlayerId)}>Verify & Continue</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if all players in the round have completed their scores
  const allPlayersComplete = players.length > 0 && completedPlayerIds.length === players.length;

  return (
    <div className="space-y-4">

      {/* Scorecard Complete Warning Banner */}
      {allPlayersComplete && (
        <Card className="border-4 border-green-500 shadow-2xl bg-green-50">
          <CardContent className="p-8">
            <div className="flex items-center gap-4 mb-6">
              <CheckCircle2 className="w-16 h-16 text-green-600" />
              <div className="flex-1">
                <p className="text-5xl font-bold text-green-800">Scorecard Complete!</p>
                <p className="text-xl text-green-700 mt-2">All {players.length} players have verified their scores.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 h-14 text-lg font-bold"
                onClick={() => {
                  // Scroll to compute results
                  const computeButton = document.querySelector('.tour-compute-results');
                  if (computeButton) {
                    computeButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }}
              >
                Compute Results
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-green-600 text-green-700 h-14 text-lg font-bold"
                onClick={() => {
                  // Clear to start new scorecard
                  if (confirm("Start a new scorecard? This will clear all current scores.")) {
                    const empty = {};
                    players.forEach(p => { empty[p.player_id] = new Array(18).fill(0); });
                    setScores(empty);
                    setGroupLockedPlayerIds(null);
                    onCompletedChange([]);
                    setShowVerify(false);
                    setCurrentHole(0);
                    setSelectedPlayerId(players[0]?.player_id || null);
                  }
                }}
              >
                Start New Scorecard
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Group Flow — always visible for scorecard setup */}
      <ScorecardGroupFlow
          round={round}
          onPlayerSelect={(id) => { setSelectedPlayerId(id); }}
          selectedForGroup={selectedForGroup}
          onSelectedForGroupChange={onSelectedForGroupChange}
          onGroupLocked={(ids) => setGroupLockedPlayerIds(ids)}
          onVerified={handleVerified}
          onEdit={() => {
            setShowVerify(false);
          }}
          currentPlayerId={selectedPlayerId}
          completedPlayerIds={completedPlayerIds}
          showVerify={showVerify}
          verifyTotals={verifyTotals}
          verifyPlayerName={verifyPlayerName}
          scoreMode={scoreMode}
        />



      {/* Current player indicator — shown when in group flow */}
      {selectedForGroup.length > 0 && !showVerify && (
        <Card className="border-0 shadow-sm bg-primary/5">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Currently {isTeamScore ? "scoring" : "dictating"}:</p>
            <p className="text-sm font-semibold text-foreground">
              {isTeamScore
                ? (getTeamOfPlayer(round, selectedPlayerId)?.label || "Team")
                : (players.find(p => p.player_id === selectedPlayerId)?.name || "—")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Clear all scores — top-level, visible always */}
      <Card className="border-0 shadow-sm mb-4 bg-destructive/5">
        <CardContent className="p-4">
          {clearConfirm ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-destructive font-medium">Clear all scores?</span>
              <Button
                onClick={() => {
                  const empty = {};
                  players.forEach(p => { empty[p.player_id] = new Array(18).fill(""); });
                  setScores(empty);
                  setGroupLockedPlayerIds(null);
                  onCompletedChange([]);
                  setShowVerify(false);
                  setCurrentHole(0);
                  setClearConfirm(false);
                  // Propagate cleared scores to parent (updates ScoreSummary) + persist + save to DB
                  const cleared = {};
                  players.forEach(p => { cleared[p.player_id] = new Array(18).fill(""); });
                  onScoresChange?.(cleared);
                  try {
                    sessionStorage.setItem(`liveScores_${roundId}`, JSON.stringify(cleared));
                    localStorage.setItem(`liveScores_backup_${roundId}`, JSON.stringify(cleared));
                  } catch {}
                  players.forEach(p => onPlayerScoreSave?.(p.player_id, cleared[p.player_id]));
                  toast.success("All scores cleared");
                }}
                size="sm"
                className="text-destructive"
              >
                Yes, clear all
              </Button>
              <Button
                onClick={() => setClearConfirm(false)}
                variant="outline"
                size="sm"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => setClearConfirm(true)}
              variant="destructive"
              size="sm"
              className="w-full justify-start gap-2"
            >
              🗑️ Clear all scores &amp; start over
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Main content - always show unless in group verify mode */}
      {!showVerify && (
        <>


        {/* Hole nav + dots — all modes */}
      <Card id="score-entry-area" className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" disabled={currentHole === 0} onClick={() => setCurrentHole(h => h - 1)}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">Hole {currentHole + 1}</p>
                <p className="text-sm text-muted-foreground">Par {holePar}</p>
              </div>
              <Button variant="ghost" size="icon" disabled={currentHole === 17} onClick={() => setCurrentHole(h => h + 1)}>
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={generateDummyScores} className="text-xs gap-1">
                <Zap className="w-3 h-3" /> Trial Scores
              </Button>
            </div>
          </div>
          <div className="flex justify-center gap-1 flex-wrap">
            {Array.from({ length: 18 }, (_, i) => {
              const allFilled = players.every(p => {
                const s = scores[p.player_id]?.[i];
                return s === "X" || s > 0;
              });
              return (
                <button
                  key={i}
                  onClick={() => setCurrentHole(i)}
                  className={`w-10 h-10 rounded-full text-sm font-medium transition-all ${
                    i === currentHole
                      ? "bg-primary text-primary-foreground"
                      : allFilled
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Score Summary — all modes, shown when player selected and has any score */}
      {selectedPlayerId && (() => {
        const d = getNineData(selectedPlayerId);
        const anyScore = scores[selectedPlayerId]?.some(s => s > 0 || s === "X");
        if (!anyScore) return null;
        return (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-foreground mb-3">
                {isTeamScore
                  ? (getTeamOfPlayer(round, selectedPlayerId)?.label || "Team")
                  : players.find(p => p.player_id === selectedPlayerId)?.name} — Score Summary
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-secondary/40 rounded-lg p-2">
                  <p className="text-xs text-muted-foreground">Front 9</p>
                  <p className="font-bold text-foreground text-xl">{d.frontNine != null && d.frontNine > 0 ? d.frontNine : "—"}</p>
                  </div>
                  <div className="bg-secondary/40 rounded-lg p-2">
                  <p className="text-xs text-muted-foreground">Back 9</p>
                  <p className="font-bold text-foreground text-xl">{d.backNine != null && d.backNine > 0 ? d.backNine : "—"}</p>
                  </div>
                  <div className="bg-primary/10 rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="font-bold text-primary text-xl">{d.total != null && d.total > 0 ? d.total : "—"}</p>
                  </div>
                </div>
                {scores[selectedPlayerId]?.every(s => s === "X" || s > 0) && (
                  <Button
                    className="w-full mt-4 gap-2"
                    onClick={() => setShowVerify(true)}
                  >
                    Verify Scores
                  </Button>
                )}
                </CardContent>
                </Card>
                );
                })()}

      {/* Score grid — visible in all three modes for direct editing */}
      {selectedPlayerId && (
        <Card className="border-0 shadow-sm" data-all-scores>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">All Scores</p>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-destructive hover:text-destructive gap-1"
                onClick={() => {
                  setScores(prev => ({ ...prev, [selectedPlayerId]: new Array(18).fill(0) }));
                }}
              >
                <Trash2 className="w-3 h-3" /> Clear All
              </Button>
            </div>
            <div className="grid grid-cols-9 gap-1">
               <div className="text-xs font-semibold text-muted-foreground">Hole</div>
               {Array.from({ length: 18 }, (_, i) => (
                 <div key={i} className="text-center text-xs font-semibold text-muted-foreground">{i + 1}</div>
               ))}
             </div>
             <div className="grid grid-cols-9 gap-1">
               <div className="text-xs font-semibold text-foreground">Score</div>
               {scores[selectedPlayerId]?.map((score, i) => {
                const commitCell = (rawVal, inputEl) => {
                  const val = rawVal.toUpperCase().trim();
                  if (val === "" || val === "0") {
                    updateScore(selectedPlayerId, i, 0, true);
                  } else if (val === "X") {
                    updateScore(selectedPlayerId, i, "X", true);
                  } else {
                    const num = parseInt(val, 10);
                    if (!isNaN(num) && num >= 1 && num <= 20) {
                      updateScore(selectedPlayerId, i, num, true);
                    } else if (inputEl) {
                      // revert invalid input
                      inputEl.value = score === 0 ? "" : String(score);
                    }
                  }
                };
                return (
                  <input
                    key={`${selectedPlayerId}-grid-${i}-${score === 0 ? "empty" : score}`}
                    type="text"
                    inputMode="numeric"
                    autoCorrect="off"
                    autoCapitalize="off"
                    autoComplete="off"
                    defaultValue={score === 0 ? "" : score}
                    data-grid-cell
                    data-hole={i}
                    onFocus={e => e.target.select()}
                    onChange={e => {
                      const val = e.target.value.toUpperCase();
                      // Cancel any pending advance
                      if (gridAdvanceTimers.current[i]) {
                        clearTimeout(gridAdvanceTimers.current[i]);
                        gridAdvanceTimers.current[i] = null;
                      }
                      if (val === "X") {
                        commitCell(val, e.target);
                        // advance immediately for X
                        gridAdvanceTimers.current[i] = setTimeout(() => {
                          const inputs = document.querySelectorAll(`[data-grid-cell]`);
                          if (inputs[i + 1]) inputs[i + 1].focus();
                        }, 50);
                      } else if (/^\d{2,}$/.test(val)) {
                        // Already 2+ digits — commit immediately and advance after render
                        commitCell(val, e.target);
                        setTimeout(() => {
                          const inputs = document.querySelectorAll(`[data-grid-cell]`);
                          if (inputs[i + 1]) {
                            inputs[i + 1].focus();
                            inputs[i + 1].select();
                          }
                        }, 50);
                      } else if (/^\d$/.test(val)) {
                        // Single digit — wait to see if another digit follows
                        gridAdvanceTimers.current[i] = setTimeout(() => {
                          commitCell(e.target.value, e.target);
                          setTimeout(() => {
                            const inputs = document.querySelectorAll(`[data-grid-cell]`);
                            if (inputs[i + 1]) {
                              inputs[i + 1].focus();
                              inputs[i + 1].select();
                            }
                          }, 25);
                        }, 200);
                      } else if (val === "") {
                        commitCell("", e.target);
                      }
                    }}
                    onBlur={e => {
                      if (gridAdvanceTimers.current[i]) {
                        clearTimeout(gridAdvanceTimers.current[i]);
                        gridAdvanceTimers.current[i] = null;
                      }
                      const val = e.target.value.toUpperCase().trim();
                      if (val === "" || val === "0") updateScore(selectedPlayerId, i, 0, false);
                      else if (val === "X") updateScore(selectedPlayerId, i, "X", false);
                      else {
                        const num = parseInt(val, 10);
                        if (!isNaN(num) && num >= 1 && num <= 20) updateScore(selectedPlayerId, i, num, false);
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (gridAdvanceTimers.current[i]) {
                          clearTimeout(gridAdvanceTimers.current[i]);
                          gridAdvanceTimers.current[i] = null;
                        }
                        commitCell(e.target.value, e.target);
                        const inputs = document.querySelectorAll(`[data-grid-cell]`);
                        if (inputs[i + 1]) inputs[i + 1].focus();
                      }
                    }}
                    className={`text-center text-lg font-bold h-12 p-2 w-full rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring ${getScoreColor(score, par[i])}`}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Voice entry — always shown in dictate mode, also shown in type mode */}
      <Card id="voice-entry-area" className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">{isTeamScore ? "Team Entry" : "Voice Entry"}</p>
              <p className="text-lg font-bold text-foreground mt-1">
                {isTeamScore
                  ? (getTeamOfPlayer(round, selectedPlayerId)?.label || "Team")
                  : (players.find(p => p.player_id === selectedPlayerId)?.name || "—")}
              </p>
            </div>
          </div>
          <Button
             onClick={() => {
               if (!selectedPlayerId) { toast.error("Please select a player first."); return; }
               if (isParsing) return;
               isListening ? stopListening() : startListening();
             }}
             style={{ backgroundColor: '#000000', color: '#ffffff' }}
             size="lg"
             className="w-full gap-2 text-lg font-semibold py-6"
           >
             {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
             Dictate Scores
           </Button>
          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs text-muted-foreground">Dictate all 18 scores — speak naturally, e.g. <em>4 5 3 twelve 4 5...</em></p>
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">⚠️ Tap the mic and speak all 18 scores. If the mic stops early, tap it again and continue. <strong>Do not say commas or "and"</strong>. For scores of 10 or more, say the word (e.g. "ten", "eleven", "sixteen"). For a <strong>Hole-in-One</strong>, pause briefly after saying "one" before continuing. Say "ex" for a DQ. Fix errors in the grid below.</p>
            {transcript && (() => {
              // Strip the "[N scores saved] ..." status prefix before previewing
              const rawForPreview = transcript.replace(/^\[\d+ scores saved\].*$/, '').trim();
              // Show a live preview of how scores will be parsed
              const previewCleaned = preprocessTranscript(rawForPreview);
              const previewTokens = previewCleaned.split(/\s+/).filter(t => t.length > 0);
              const previewScores = [];
              for (const token of previewTokens) {
                if (token === 'X') previewScores.push('X');
                else { const num = parseInt(token, 10); if (!isNaN(num) && num >= 1 && num <= 20) previewScores.push(num); }
              }
              const alreadySaved = appliedScoreCountRef.current;
              return (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground">Raw Transcript</p>
                  <div className="flex gap-2 items-center p-3 bg-muted border border-border rounded-xl">
                    <input
                      className="flex-1 bg-transparent text-sm outline-none text-foreground font-mono"
                      value={transcript}
                      onChange={e => setTranscript(e.target.value)}
                    />
                    <Button size="sm" variant="outline" onClick={() => setTranscript('')}>
                      Clear
                    </Button>
                    <Button size="sm" onClick={parseTranscript} disabled={isParsing}>
                      {isParsing ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Apply'}
                    </Button>
                  </div>
                  <div className={`p-2 border rounded-lg ${alreadySaved + previewScores.length > 18 ? 'bg-destructive/10 border-destructive/40' : 'bg-primary/10 border-primary/30'}`}>
                    <p className={`text-xs font-medium mb-1 ${alreadySaved + previewScores.length > 18 ? 'text-destructive' : 'text-primary'}`}>
                      Preview ({alreadySaved + previewScores.length}/18 holes{alreadySaved > 0 ? ` — ${alreadySaved} already saved` : ''}):
                      {alreadySaved + previewScores.length > 18 && <span className="ml-1 font-bold">⚠️ Too many scores — edit the transcript to remove the extra {(alreadySaved + previewScores.length) - 18}</span>}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Array.from({ length: Math.max(18, alreadySaved + previewScores.length) }, (_, i) => {
                        const isSaved = i < alreadySaved;
                        const newScore = previewScores[i - alreadySaved];
                        const playerScore = scores[selectedPlayerId]?.[i];
                        const isExtra = i >= 18;
                        return (
                          <div key={i} className="flex flex-col items-center">
                            <span className={`text-[10px] leading-none ${isExtra ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>{i + 1}</span>
                            <span className={`text-xs font-mono font-bold ${isExtra ? 'text-destructive' : isSaved ? 'text-green-600' : newScore ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {isSaved ? (playerScore || '✓') : (newScore || '—')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
            {isParsing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Parsing scores…
              </div>
            )}

          </div>
        </CardContent>
      </Card>


      </>
      )}
      </div>
      );
      }