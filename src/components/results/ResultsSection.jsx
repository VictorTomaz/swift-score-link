import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Collapsible wrapper for a block of detailed results. Keeps the settlement
 * summary front and center while the full breakdowns stay one tap away.
 */
export default function ResultsSection({ title, subtitle, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground truncate">{title}</p>
          {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-3 pb-3 space-y-3">{children}</div>}
    </div>
  );
}