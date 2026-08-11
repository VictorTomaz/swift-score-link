import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function Step4Date({ form, updateForm, nextStep, prevStep }) {
  const handleNext = () => {
    nextStep();
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Round Date</h2>
        <p className="text-sm text-muted-foreground mt-1">When are you playing?</p>
      </div>

      <Input
        type="date"
        value={form.date || new Date().toISOString().split('T')[0]}
        onChange={e => updateForm({ date: e.target.value })}
      />

      <div className="flex gap-2">
        <button type="button" onClick={prevStep} className="flex-1 py-2 px-4 rounded-md border-2 border-border bg-card text-foreground font-medium text-sm">
          Back
        </button>
        <Button onClick={handleNext} className="flex-1">
          Next
        </Button>
      </div>
    </div>
  );
}