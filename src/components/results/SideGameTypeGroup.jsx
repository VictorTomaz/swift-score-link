import React from "react";

/**
 * Wraps one side-game TYPE (e.g. all Gross Skins across every day/flight)
 * with a single header. Hidden entirely when it has no content.
 */
export default function SideGameTypeGroup({ title, children }) {
  const hasContent = React.Children.toArray(children).some(Boolean);
  if (!hasContent) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mt-4">{title}</h3>
      {children}
    </div>
  );
}