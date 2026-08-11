import React from 'react';

const SEGMENT_FORMATS = [
  { value: 'chapman', label: 'Chapman' },
  { value: 'best_ball', label: 'Best Ball' },
  { value: 'scramble', label: 'Scramble' },
  { value: 'aggregate', label: 'Aggregate' },
];

const DEFAULT_SEGMENTS = [
  { holes: 'Holes 1–6', format: 'chapman' },
  { holes: 'Holes 7–12', format: 'best_ball' },
  { holes: 'Holes 13–18', format: 'scramble' },
];

export function defaultSegments666() {
  return DEFAULT_SEGMENTS.map(s => ({ ...s }));
}

export default function Segments666Config({ segments, onChange }) {
  const current = segments && segments.length === 3 ? segments : defaultSegments666();

  const handleFormatChange = (idx, format) => {
    const next = current.map((s, i) => (i === idx ? { ...s, format } : s));
    onChange(next);
  };

  return (
    <div className="space-y-3 rounded-lg border-2 border-border p-3 bg-muted/30">
      <p className="text-sm font-medium text-foreground">6-6-6 Segments</p>
      <p className="text-xs text-muted-foreground -mt-1">Choose the format played in each 6-hole segment.</p>
      {current.map((seg, idx) => (
        <div key={idx} className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-foreground whitespace-nowrap">{seg.holes}</span>
          <div className="flex flex-wrap justify-end gap-1.5">
            {SEGMENT_FORMATS.map(f => (
              <button
                key={f.value}
                type="button"
                onClick={() => handleFormatChange(idx, f.value)}
                className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                  seg.format === f.value
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border text-foreground hover:border-primary/50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}