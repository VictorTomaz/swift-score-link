import React from 'react';
import { Button } from '@/components/ui/button';

export default function Step1GameMode({ form, updateForm, nextStep, prevStep }) {
  const mainGame = form.games?.find(g => g.is_main) || form.games?.[0];
  const isTeam = mainGame?.type === 'team' || form.team_mode || (form.game_type && form.game_type !== 'individual');
  const isChild = !!form.parent_round_id;
  const isMultiDay = !!form.is_multi_day;
  const fixedDisabled = isTeam || isChild || isMultiDay;

  const handleSelect = (mode) => {
    if (isChild) return;
    updateForm({ game_mode: mode });
    // Auto advance
    setTimeout(nextStep, 300);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Choose Game Mode</h2>
        <p className="text-sm text-muted-foreground mt-1">How do you want to handle payouts?</p>
      </div>

      {isChild && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">Locked:</span> Game mode is inherited from
            Day 1 of this series. Only side games are configured per day.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <button
          type="button"
          disabled={fixedDisabled}
          onClick={() => !fixedDisabled && handleSelect('SWIFT_SCORE_11')}
          className={`w-full p-3.5 rounded-lg border-2 transition-all text-left ${
            fixedDisabled
              ? 'border-border bg-muted/40 opacity-40 cursor-not-allowed'
              : form.game_mode === 'SWIFT_SCORE_11'
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary/50'
          }`}
        >
          <p className="font-semibold text-foreground text-sm">⚡ Fixed Payouts</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isChild ? 'Inherited from Day 1' : isMultiDay ? 'Not available for multi-day series' : isTeam ? 'Not available for team formats' : '$11 formula (scales to any buy-in)'}
          </p>
        </button>

        <button
          type="button"
          disabled={isChild}
          onClick={() => !isChild && handleSelect('CUSTOM')}
          className={`w-full p-3.5 rounded-lg border-2 transition-all text-left ${
            isChild
              ? 'border-border bg-muted/40 opacity-40 cursor-not-allowed'
              : form.game_mode === 'CUSTOM'
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary/50'
          }`}
        >
          <p className="font-semibold text-foreground text-sm">🎛️ Custom Payouts</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isChild ? 'Inherited from Day 1' : 'You control the splits'}
          </p>
        </button>

        <button
          type="button"
          disabled={isChild}
          onClick={() => !isChild && handleSelect('OFF')}
          className={`w-full p-3.5 rounded-lg border-2 transition-all text-left ${
            isChild
              ? 'border-border bg-muted/40 opacity-40 cursor-not-allowed'
              : form.game_mode === 'OFF'
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary/50'
          }`}
        >
          <p className="font-semibold text-foreground text-sm">📋 Off (Side Games Only)</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isChild ? 'Inherited from Day 1' : 'Play side games — also can keep track of scores'}
          </p>
        </button>
      </div>

      {!isChild && (
        <p className="text-xs text-muted-foreground italic px-1">
          Tip: Multi-day tournaments use Custom Payouts — choose Custom to enable the multi-day option on the Buy-In step.
        </p>
      )}

      {isChild && (
        <button
          type="button"
          onClick={nextStep}
          className="w-full py-2.5 px-4 rounded-md bg-primary text-primary-foreground font-semibold text-sm"
        >
          Continue
        </button>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={prevStep}
          className="flex-1 py-2 px-4 rounded-md border-2 border-border bg-card text-foreground font-medium text-sm"
        >
          Back
        </button>
      </div>
    </div>
  );
}