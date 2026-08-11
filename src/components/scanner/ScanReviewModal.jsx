"use client";

import React, { useState, useEffect } from "react";
import { X, Check, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ScanReviewModal({ isOpen, onClose, onSave, scannedData, round }) {
  const [playerScores, setPlayerScores] = useState([]);
  const [activePlayerIdx, setActivePlayerIdx] = useState(0);

  useEffect(() => {
    if (scannedData && round?.players) {
      const merged = scannedData.map(scanned => {
        const roundPlayer = round.players.find(p => p.player_id === scanned.playerId);
        
        // CRITICAL: Ensure player_id is included - this is required for saving
        const playerId = scanned.playerId || roundPlayer?.player_id || '';
        
        // Ensure scores is always an 18-element array
        let scoresArray = scanned.scores;
        if (!Array.isArray(scoresArray) || scoresArray.length !== 18) {
          scoresArray = Array(18).fill('');
          if (Array.isArray(scanned.scores)) {
            scanned.scores.slice(0, 18).forEach((s, i) => {
              scoresArray[i] = (s !== null && s !== undefined && s !== '') ? String(s) : '';
            });
          }
        }
        
        // Normalize all scores to strings
        const scores = scoresArray.map(s => {
          if (s === null || s === undefined || s === '' || s === 0 || s === '0') return '';
          return String(s);
        });
        
        // Return with explicit player_id field (snake_case for DB compatibility)
        return { 
          player_id: playerId,
          player_name: scanned.playerName || roundPlayer?.name,
          scores 
        };
      });
      console.log('ScanReviewModal playerScores:', merged);
      setPlayerScores(merged);
    }
  }, [scannedData, round]);

  const handleScoreChange = (playerIdx, holeIdx, value) => {
    const newScores = [...playerScores];
    const newHoleScores = [...newScores[playerIdx].scores];
    const upper = value.toUpperCase().trim();
    if (upper === 'X') {
      newHoleScores[holeIdx] = 'X';
    } else {
      const num = parseInt(value, 10);
      newHoleScores[holeIdx] = (isNaN(num) || num < 1 || num > 20) ? '' : String(num);
    }
    newScores[playerIdx].scores = newHoleScores;
    setPlayerScores(newScores);
  };

  const getScoreValue = (score) => {
    if (score === null || score === undefined || score === '' || score === 0 || score === '0') return '';
    if (Array.isArray(score)) return '';
    return String(score);
  };

  const handleSave = () => {
    console.log('handleSave called with playerScores:', playerScores);
    onSave(playerScores);
  };

  const activePlayer = playerScores[activePlayerIdx];
  const par = round?.par || Array(18).fill(4);
  const hcpIndexes = round?.hole_handicap_indexes || Array(18).fill(0);

  // Calculate totals
  const scores = activePlayer?.scores || [];
  const isX = s => String(s).toUpperCase() === 'X';
  const sumNine = (arr) => {
    const valid = arr.filter(s => s !== '' && s !== 0 && s !== null && s !== undefined);
    if (valid.length === 0) return 0;
    if (valid.some(isX)) return null;
    return valid.reduce((a, b) => a + parseInt(b, 10), 0);
  };
  const frontTotal = sumNine(scores.slice(0, 9));
  const backTotal = sumNine(scores.slice(9, 18));
  const grandTotal = (frontTotal === null || backTotal === null) ? null : frontTotal + backTotal;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-card border-border rounded-t-xl sm:rounded-xl w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col shadow-2xl" style={{ height: 'calc(100vh - 20px)' }}>
        <div className="flex items-center justify-between p-3 sm:p-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              Review Scanned Scores
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 sm:p-4 text-xs text-muted-foreground space-y-1 shrink-0">
          <p>Tap any cell to correct the scanned value. Type "X" for DQ/pickup (no score on a hole).</p>
          <p className="text-amber-600 font-medium">⚠️ Verify back-nine scores (holes 10-18) are in the correct columns for each player.</p>
        </div>

        {/* Player tabs */}
        <div className="flex gap-2 overflow-x-auto p-3 sm:p-4 pt-0 shrink-0">
          {playerScores.map((player, idx) => (
            <button
              key={player.player_id || idx}
              onClick={() => setActivePlayerIdx(idx)}
              className={`px-4 py-3 rounded-lg text-base font-semibold whitespace-nowrap transition-colors ${
                activePlayerIdx === idx
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground hover:bg-muted/80"
              }`}
            >
              {player.player_name || `Player ${idx + 1}`}
            </button>
          ))}
        </div>

        {/* Score grid - scrollable area */}
        <div className="flex-1 overflow-auto min-h-0 p-3 sm:p-4 pt-0">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="border-b">
                      <th className="p-2 text-left text-xs font-medium text-muted-foreground w-32">Hole</th>
                      {Array.from({ length: 9 }, (_, i) => (
                        <th key={i} className="p-2 text-center text-xs font-medium text-muted-foreground w-12">{i + 1}</th>
                      ))}
                      <th className="p-2 text-center text-xs font-medium bg-muted/50 w-12">OUT</th>
                      {Array.from({ length: 9 }, (_, i) => (
                        <th key={i + 9} className="p-2 text-center text-xs font-medium text-muted-foreground w-12">{i + 10}</th>
                      ))}
                      <th className="p-2 text-center text-xs font-medium bg-muted/50 w-12">IN</th>
                      <th className="p-2 text-center text-xs font-medium bg-muted/50 w-12">TOT</th>
                    </tr>
                    <tr className="border-b bg-muted/30">
                      <td className="p-2 text-xs font-medium text-center">Par</td>
                      {par.slice(0, 9).map((p, i) => (
                        <td key={i} className="p-2 text-xs text-center text-muted-foreground">{p}</td>
                      ))}
                      <td className="p-2 text-xs text-center font-medium bg-muted/50">
                        {par.slice(0, 9).reduce((a, b) => a + b, 0)}
                      </td>
                      {par.slice(9, 18).map((p, i) => (
                        <td key={i + 9} className="p-2 text-xs text-center text-muted-foreground">{p}</td>
                      ))}
                      <td className="p-2 text-xs text-center font-medium bg-muted/50">
                        {par.slice(9, 18).reduce((a, b) => a + b, 0)}
                      </td>
                      <td className="p-2 text-xs text-center font-medium bg-muted/50">
                        {par.reduce((a, b) => a + b, 0)}
                      </td>
                    </tr>
                    <tr className="border-b bg-muted/30">
                      <td className="p-2 text-xs font-medium text-center">HCP</td>
                      {hcpIndexes.slice(0, 9).map((h, i) => (
                        <td key={i} className="p-2 text-xs text-center text-muted-foreground">{h}</td>
                      ))}
                      <td className="p-2 text-xs text-center font-medium bg-muted/50">-</td>
                      {hcpIndexes.slice(9, 18).map((h, i) => (
                        <td key={i + 9} className="p-2 text-xs text-center text-muted-foreground">{h}</td>
                      ))}
                      <td className="p-2 text-xs text-center font-medium bg-muted/50">-</td>
                      <td className="p-2 text-xs text-center font-medium bg-muted/50">-</td>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-3 text-base font-bold text-foreground">
                        {activePlayer?.player_name || `Player ${activePlayerIdx + 1}`}
                      </td>
                      {(activePlayer?.scores || []).slice(0, 9).map((score, i) => (
                        <td key={i} className="p-2">
                          <div className="relative inline-block">
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="w-14 h-14 relative">
                                <div className="absolute top-0 left-0 w-1.5 h-1.5 bg-primary rounded-full"></div>
                                <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-primary rounded-full"></div>
                                <div className="absolute bottom-0 left-0 w-1.5 h-1.5 bg-primary rounded-full"></div>
                                <div className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-primary rounded-full"></div>
                              </div>
                            </div>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={getScoreValue(score)}
                              onChange={(e) => handleScoreChange(activePlayerIdx, i, e.target.value)}
                              onFocus={(e) => {
                                e.target.select();
                                e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }}
                              className="w-14 h-14 text-center text-xl font-bold border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent relative z-10"
                              placeholder="-"
                              maxLength={2}
                            />
                          </div>
                        </td>
                      ))}
                      <td className="p-2 text-center text-base font-bold bg-muted/50">
                        {frontTotal === null ? "DQ" : (frontTotal || "-")}
                      </td>
                      {(activePlayer?.scores || []).slice(9, 18).map((score, i) => (
                        <td key={i + 9} className="p-2">
                          <div className="relative inline-block">
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="w-14 h-14 relative">
                                <div className="absolute top-0 left-0 w-1.5 h-1.5 bg-primary rounded-full"></div>
                                <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-primary rounded-full"></div>
                                <div className="absolute bottom-0 left-0 w-1.5 h-1.5 bg-primary rounded-full"></div>
                                <div className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-primary rounded-full"></div>
                              </div>
                            </div>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={getScoreValue(score)}
                              onChange={(e) => handleScoreChange(activePlayerIdx, i + 9, e.target.value)}
                              onFocus={(e) => {
                                e.target.select();
                                e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }}
                              className="w-14 h-14 text-center text-xl font-bold border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent relative z-10"
                              placeholder="-"
                              maxLength={2}
                            />
                          </div>
                        </td>
                      ))}
                      <td className="p-2 text-center text-base font-bold bg-muted/50">
                        {backTotal === null ? "DQ" : (backTotal || "-")}
                      </td>
                      <td className="p-2 text-center text-lg font-bold text-primary bg-muted/50">
                        {grandTotal === null ? "DQ" : (grandTotal || "-")}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-3 p-3 sm:p-4 pt-0 border-t shrink-0">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleSave} className="flex-1 gap-2" disabled={grandTotal === 0}>
            <Check className="w-4 h-4" />
            {grandTotal === 0 ? 'No Scores Detected' : 'Save Scores'}
          </Button>
        </div>
      </div>
    </div>
  );
}