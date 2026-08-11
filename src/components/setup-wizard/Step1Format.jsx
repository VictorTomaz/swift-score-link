import React from 'react';
import { Button } from '@/components/ui/button';

export default function Step1Format({ form, updateForm, nextStep, prevStep }) {
  const isTeamSelected = form.game_type && form.game_type !== 'individual';

  const handleSelect = (format) => {
    if (format === 'individual') {
      updateForm({ game_type: 'individual', team_mode: false });
    } else {
      updateForm({ game_type: 'team_best_ball', team_mode: true, team_format: 'best_ball' });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Format</h2>
        <p className="text-sm text-muted-foreground mt-1">Individual or team round?</p>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => handleSelect('individual')}
          className={`w-full p-3.5 rounded-lg border-2 transition-all text-left ${form.game_type === 'individual' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
        >
          <p className="font-semibold text-foreground text-sm">🏌️ Individual</p>
          <p className="text-xs text-muted-foreground mt-0.5">Standard individual play</p>
        </button>

        <button
          type="button"
          onClick={() => handleSelect('team')}
          className={`w-full p-3.5 rounded-lg border-2 transition-all text-left ${isTeamSelected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
        >
          <p className="font-semibold text-foreground text-sm">👥 Team</p>
          <p className="text-xs text-muted-foreground mt-0.5">Scramble, best ball, 6-6-6, or Chapman</p>
        </button>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={prevStep} className="flex-1">Back</Button>
        <Button onClick={nextStep} disabled={!form.game_type} className="flex-1">Next</Button>
      </div>
    </div>
  );
}