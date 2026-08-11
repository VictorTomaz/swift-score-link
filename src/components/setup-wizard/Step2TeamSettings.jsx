import React from 'react';
import { Button } from '@/components/ui/button';
import Segments666Config, { defaultSegments666 } from '@/components/setup-wizard/Segments666Config';

const GAME_TYPES = [
  { value: 'team_scramble', label: 'Scramble', desc: 'One team score per hole' },
  { value: 'team_best_ball', label: 'Best Ball', desc: 'Best-ball team rows + individual scores' },
  { value: 'team_6_6_6', label: '6-6-6', desc: 'Three 6-hole segments — choose format per segment' },
  { value: 'team_chapman', label: 'Chapman', desc: 'Team bookend format' },
  { value: 'team_aggregate', label: 'Aggregate', desc: 'Sum of all team scores' },
];

const HCP_FORMULAS = [
  { value: 'individual', label: 'Individual (Per-Player Handicap)' },
  { value: 'combined_avg', label: 'Combined Average' },
  { value: 'combined_85', label: '85% of Combined' },
  { value: 'usga_scramble', label: 'USGA Scramble (25% Low / 15% High)' },
  { value: 'split_60_40', label: '60/40 (60% Low / 40% High)' },
  { value: 'split_35_15', label: '35/15 (35% Low / 15% High)' },
  { value: 'sum', label: 'Full Combined (Sum)' },
];

export default function Step2TeamSettings({ form, updateForm, nextStep, prevStep }) {
  const handleGameTypeSelect = (value) => {
    const team_format = value === 'team_scramble' ? 'scramble' : value === 'team_aggregate' ? 'aggregate' : 'best_ball';
    const updates = { game_type: value, team_format };
    if (value === 'team_6_6_6' && !form.segments_666) {
      updates.segments_666 = defaultSegments666();
    }
    updateForm(updates);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Team Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">Configure your team format.</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Team Format</label>
        {GAME_TYPES.map((gt) => (
          <button
            key={gt.value}
            type="button"
            onClick={() => handleGameTypeSelect(gt.value)}
            className={`w-full p-3 rounded-lg border-2 transition-all text-left ${form.game_type === gt.value ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
          >
            <p className="font-semibold text-foreground text-sm">{gt.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{gt.desc}</p>
          </button>
        ))}
      </div>

      {form.game_type === 'team_6_6_6' && (
        <Segments666Config
          segments={form.segments_666}
          onChange={(segments) => updateForm({ segments_666: segments })}
        />
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Team Size</label>
        <div className="flex gap-2">
          {[2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => updateForm({ team_size: n })}
              className={`flex-1 py-2 rounded-lg border-2 transition-all font-medium text-sm ${(form.team_size || 2) === n ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
            >
              {n} Players
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Handicap Formula</label>
        <select
          value={form.hcp_formula || 'combined_85'}
          onChange={(e) => updateForm({ hcp_formula: e.target.value })}
          className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
        >
          {HCP_FORMULAS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={prevStep} className="flex-1">Back</Button>
        <Button onClick={nextStep} className="flex-1">Next</Button>
      </div>
    </div>
  );
}