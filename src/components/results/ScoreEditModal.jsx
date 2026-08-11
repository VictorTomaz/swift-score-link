import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function ScoreEditModal({ isOpen, onClose, player, round, roundPlayers, onSave, isSaving, initialScores }) {
  const [scores, setScores] = useState(null);

  useEffect(() => {
    if (!isOpen || !player) {
      setScores(null);
      return;
    }

    const countValid = (arr) => arr ? arr.filter(s => s !== '' && s !== null && s !== undefined).length : 0;

    const applyScores = (raw) => {
      const loaded = (raw || []).map(s => (s === null || s === undefined || s === '') ? '' : String(s));
      while (loaded.length < 18) loaded.push('');
      setScores(loaded);
    };

    const roundId = round?.id || new URLSearchParams(window.location.search).get('id');

    // If no round ID yet, fall back to initialScores immediately
    if (!roundId) {
      applyScores(initialScores || []);
      return;
    }

    // Always fetch from RoundScore DB first (authoritative), fall back to initialScores
    base44.entities.RoundScore.filter({ round_id: roundId })
      .then(records => {
        const record = records.find(r => r.player_id === player.player_id);
        if (record?.scores && countValid(record.scores) > 0) {
          applyScores(record.scores);
        } else if (initialScores && countValid(initialScores) > 0) {
          applyScores(initialScores);
        } else {
          applyScores([]);
        }
      })
      .catch(() => {
        if (initialScores && countValid(initialScores) > 0) {
          applyScores(initialScores);
        } else {
          applyScores([]);
        }
      });
  }, [isOpen, player?.player_id, round?.id]);

  const handleChange = useCallback((i, val) => {
    setScores(prev => {
      const next = [...prev];
      next[i] = val;
      return next;
    });
  }, []);

  const handleSave = () => {
    onSave(scores);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-md overflow-y-auto"
        style={{ maxHeight: '85vh' }}
      >
        <DialogHeader>
          <DialogTitle>Edit Scores — {player?.name}</DialogTitle>
        </DialogHeader>

        {!scores ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Loading scores...</span>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Enter a number (1–20) or X for DQ. Tap Save when done.</p>
            <div className="grid grid-cols-6 gap-2">
              {scores.map((score, i) => (
                <div key={i} className="text-center space-y-1">
                  <p className="text-xs text-muted-foreground font-semibold">H{i + 1}</p>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9Xx]*"
                    value={score}
                    placeholder="-"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    onChange={e => handleChange(i, e.target.value)}
                    className="w-full text-center h-10 text-sm font-bold rounded-md border-2 border-primary/50 bg-card text-foreground px-1 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    style={{ WebkitAppearance: 'none', MozAppearance: 'textfield', fontSize: '16px' }}
                  />
                  <button
                    type="button"
                    onClick={() => handleChange(i, 'X')}
                    className="w-full text-xs py-1 rounded border border-destructive/30 bg-destructive/10 text-destructive font-semibold hover:bg-destructive/20 transition-colors"
                  >
                    DQ
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="flex-1 py-3 px-4 rounded-md border-2 border-border bg-card text-foreground font-medium text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <Button onClick={handleSave} disabled={isSaving} className="flex-1 py-3">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {isSaving ? 'Saving...' : 'Save Scores'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}