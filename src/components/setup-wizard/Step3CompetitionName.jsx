import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Lock } from 'lucide-react';

export default function Step3CompetitionName({ form, updateForm, nextStep, prevStep, parentRound }) {
  // The flight naming screen only appears for child flights in a multi-flight
  // tournament (Add Flight flow, or editing an existing child flight). For a
  // standalone round or the parent/first round, only the competition name is
  // collected — the flight name defaults to "Flight 1" automatically when
  // multi-flight is enabled later (see Step5BuyIn).
  const isChildFlight = !!(parentRound || form.parent_round_id) && !!(form.is_multi_flight || form.series_type === 'multi_flight');
  const inheritedCompetitionName = parentRound?.event_name || form.event_name || '';

  // Default flight name: "Flight 1", "Flight 2", … based on flight_number.
  // The user can override this — the input is pre-filled, not locked.
  const flightNumber = form.flight_number || 2;
  const defaultFlightName = `Flight ${flightNumber}`;

  const [name, setName] = useState(
    isChildFlight ? (form.flight_name || defaultFlightName) : (form.event_name || '')
  );

  const handleNext = () => {
    if (name.trim()) {
      if (isChildFlight) {
        updateForm({ flight_name: name.trim() });
      } else {
        updateForm({ event_name: name.trim() });
      }
      nextStep();
    }
  };

  return (
    <div className="p-6 space-y-6">
      {isChildFlight ? (
        <>
          <div>
            <h2 className="text-xl font-bold text-foreground">Flight Name</h2>
            <p className="text-sm text-muted-foreground mt-1">Name this flight — it's separate from the tournament name. The default is fine if you don't want a custom name.</p>
          </div>

          {/* Show the inherited competition name as read-only context */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
            <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Tournament (inherited)</p>
              <p className="text-sm font-medium text-foreground truncate">{inheritedCompetitionName}</p>
            </div>
          </div>

          <Input
            placeholder={`e.g. Championship Flight, President's Flight, Net Flight`}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleNext()}
            autoFocus
          />
        </>
      ) : (
        <>
          <div>
            <h2 className="text-xl font-bold text-foreground">Competition Name</h2>
            <p className="text-sm text-muted-foreground mt-1">What's this tournament called?</p>
          </div>

          <Input
            placeholder="e.g. Saturday Scramble, Weekly League"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleNext()}
            autoFocus
          />
        </>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={prevStep} className="flex-1 py-2 px-4 rounded-md border-2 border-border bg-card text-foreground font-medium text-sm">
          Back
        </button>
        <Button onClick={handleNext} disabled={!name.trim()} className="flex-1">
          Next
        </Button>
      </div>
    </div>
  );
}