import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function Step3CompetitionName({ form, updateForm, nextStep, prevStep }) {
  const [name, setName] = useState(form.event_name || '');

  const handleNext = () => {
    if (name.trim()) {
      updateForm({ event_name: name.trim() });
      nextStep();
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Competition Name</h2>
        <p className="text-sm text-muted-foreground mt-1">What's this round called?</p>
      </div>

      <Input
        placeholder="e.g. Saturday Scramble, Weekly League"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleNext()}
        autoFocus
      />

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