import React from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

/**
 * Returns a list of labels for rounds in the series that still have players
 * without any scores entered — finalizing now would read them as no-score.
 */
export function findUnscoredRounds(seriesRounds) {
  return (seriesRounds || []).filter(Boolean).map(r => {
    const players = r.players || [];
    const missing = players.filter(p => !(p.scores || []).some(s => s !== '' && s !== null && s !== undefined));
    if (missing.length === 0) return null;
    const label = r.flight_name || `Flight ${r.flight_number || 1}`;
    return { id: r.id, label, missing: missing.length, total: players.length };
  }).filter(Boolean);
}

export default function FinalizeWarningDialog({ open, onOpenChange, unscored, onConfirm }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Scores are still missing</AlertDialogTitle>
          <AlertDialogDescription>
            Finalizing now computes the main purse from every flight's scores — players without scores will be treated as no-score and won't be paid.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="text-sm text-foreground space-y-1">
          {unscored.map(u => (
            <li key={u.id}>• <span className="font-semibold">{u.label}</span> — {u.missing} of {u.total} players have no scores</li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>Wait for scores</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Finalize anyway</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}