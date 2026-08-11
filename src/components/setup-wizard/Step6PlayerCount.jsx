import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users, User } from 'lucide-react';

export default function Step6PlayerCount({ form, updateForm, nextStep, prevStep }) {
  const mainGame = form.games?.find(g => g.is_main) || form.games?.[0];
  const isTeam = mainGame?.type === 'team' || form.team_mode || (form.game_type && form.game_type !== 'individual');
  const teamSize = mainGame?.team_size || form.team_size || 2;
  const isChild = !!form.parent_round_id;
  const isFlightChild = isChild && form.series_type === 'multi_flight';

  const [count, setCount] = useState(form.player_count ? String(isTeam ? Math.round(form.player_count / teamSize) : form.player_count) : '');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const inputRef = useRef(null);

  const quickOptions = isTeam ? [4, 5, 6, 7, 8, 9] : [8, 9, 10, 11, 12, 13];
  const currentCount = isTeam ? Math.round((form.player_count || 0) / teamSize) : form.player_count;

  const applyCount = (num) => {
    const playerCount = isTeam ? num * teamSize : num;
    updateForm({ player_count: playerCount });
  };

  const handleSelect = (num) => {
    applyCount(num);
    setTimeout(nextStep, 300);
  };

  const handleCustom = () => {
    const num = parseInt(count, 10);
    if (num > 0) {
      applyCount(num);
      nextStep();
    }
  };

  const label = isTeam ? 'Number of Teams' : 'Player Count';
  const subLabel = isTeam
    ? `${teamSize}-player teams · ${count ? parseInt(count, 10) * teamSize : 0} total players`
    : 'How many players in this round?';
  const placeholder = isTeam ? 'Teams' : 'Players';

  return (
    <div className="p-6 space-y-6" style={{ paddingBottom: keyboardOpen ? '260px' : undefined }}>
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          {isTeam ? <Users className="w-5 h-5" /> : <User className="w-5 h-5" />}
          {label}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{subLabel}</p>
      </div>

      {isChild && !isFlightChild ? (
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/60 border border-border p-4 text-center">
            <p className="text-2xl font-bold text-muted-foreground">{currentCount || '—'}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Inherited from the parent round — the roster carries over across the series.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {quickOptions.map(num => (
              <button
                key={num}
                type="button"
                onClick={() => handleSelect(num)}
                className={`py-5 px-4 border-2 rounded-xl font-bold text-xl transition-all active:scale-95 ${
                  currentCount === num
                    ? 'border-primary bg-primary text-primary-foreground shadow-lg'
                    : 'border-border bg-card text-foreground hover:border-primary hover:bg-primary/10'
                }`}
              >
                {num}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Or enter custom {isTeam ? 'team count' : 'count'}:</p>
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                type="number"
                min="1"
                placeholder={placeholder}
                value={count}
                onChange={e => setCount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCustom()}
                onFocus={() => {
                  setKeyboardOpen(true);
                  setTimeout(() => inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 400);
                }}
                onBlur={() => setKeyboardOpen(false)}
                className="flex-1 h-14 text-xl font-semibold border-2 border-border focus:border-primary"
              />
              <Button onClick={handleCustom} disabled={count <= 0} className="h-14 px-5 text-base">
                Set
              </Button>
            </div>
          </div>
        </>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={prevStep} className="flex-1 py-2 px-4 rounded-md border-2 border-border bg-card text-foreground font-medium text-sm">
          Back
        </button>
        {isChild && !isFlightChild && (
          <button type="button" onClick={nextStep} className="flex-1 py-2 px-4 rounded-md bg-primary text-primary-foreground font-semibold text-sm">
            Next
          </button>
        )}
      </div>
    </div>
  );
}