import React from "react";
import { ArrowRight, CalendarClock, Pencil, Printer, Trash2 } from "lucide-react";

// Each color marks a distinct workflow across the app — this legend tells
// users what that color's workflow does, not which button it's on.
const ITEMS = [
  { label: "Primary — advance the main flow", icon: ArrowRight, swatch: "bg-primary", text: "text-primary-foreground", border: "border-primary" },
  { label: "Logistics — set tee times, teams & scorecards", icon: CalendarClock, swatch: "bg-logistics", text: "text-logistics-foreground", border: "border-logistics" },
  { label: "Edit — change existing details", icon: Pencil, swatch: "bg-edit", text: "text-edit-foreground", border: "border-edit" },
  { label: "Accent — print or email sheets", icon: Printer, swatch: "bg-accent", text: "text-accent-foreground", border: "border-accent" },
  { label: "Destructive — delete a record", icon: Trash2, swatch: "bg-destructive", text: "text-destructive-foreground", border: "border-destructive" },
];

export default function ColorLegend() {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-2.5">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Button Legend</p>
      <div className="flex flex-col gap-1.5">
        {ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-2 min-w-0">
            <span
              className={`inline-flex items-center justify-center w-5 h-5 rounded-md shrink-0 ${item.swatch} ${item.text} border ${item.border}`}
            >
              <item.icon className="w-3 h-3" />
            </span>
            <span className="text-[11px] font-medium text-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}