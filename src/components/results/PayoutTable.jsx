import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign } from "lucide-react";

const SIDE_TYPES = [
  { key: "gross_skins_payout", label: "Gross Skins" },
  { key: "net_skins_payout", label: "Net Skins" },
  { key: "kp_payout", label: "KP" },
  { key: "deuce_payout", label: "Deuce" },
];
const SIDE_KEYS = SIDE_TYPES.map(t => t.key);

const sideTotal = (dayPayouts, playerId) => {
  const p = (dayPayouts || []).find(x => x.player_id === playerId);
  if (!p) return 0;
  return SIDE_KEYS.reduce((sum, k) => sum + (p[k] || 0), 0);
};

export default function PayoutTable({ results, holdMainPayouts, payoutDays }) {
  const allPayouts = results.payouts || [];
  const isMultiDay = !!(payoutDays && payoutDays.length > 1);

  // Build day metadata + grand total before sorting so multi-day rows rank by
  // their true cumulative total (current total_payout + prior days' side games),
  // not just the current round's total_payout — otherwise players whose only
  // winnings came on a prior day sort below true $0 earners.
  const dayMeta = isMultiDay
    ? payoutDays.map((d) => ({
        dayLabel: d.dayLabel,
        dayPayouts: d.results?.payouts || [],
        isCurrent: !!d.isCurrent,
      }))
    : [];

  const grandTotal = (p) => {
    let total = p.total_payout != null ? p.total_payout : 0;
    for (const d of dayMeta) {
      if (d.isCurrent) continue;
      total += sideTotal(d.dayPayouts, p.player_id);
    }
    return total;
  };

  const payouts = [...allPayouts].sort((a, b) => {
    const aTotal = isMultiDay ? grandTotal(a) : (a.total_payout != null ? a.total_payout : 0);
    const bTotal = isMultiDay ? grandTotal(b) : (b.total_payout != null ? b.total_payout : 0);
    return bTotal - aTotal;
  });

  if (isMultiDay) {
    // Multi-day: cumulative Gross/Net + Field Gross/Net columns + one column per day's side game total.
    // Field Gross/Net (multi-flight field prizes) are overall — not per-day — so
    // they belong alongside the main Gross/Net columns, not in the day columns.
    const mainCols = holdMainPayouts
      ? []
      : [
          { key: "gross_payout", label: "Gross" },
          { key: "net_payout", label: "Net" },
          { key: "field_gross_payout", label: "Field Gross" },
          { key: "field_net_payout", label: "Field Net" },
        ].filter(c => payouts.some(p => (p[c.key] || 0) > 0));

    // One column per (day, side-game-type) that has any non-zero payout.
    const dayTypeCols = [];
    for (const d of dayMeta) {
      for (const t of SIDE_TYPES) {
        const hasValue = payouts.some((p) => {
          const pp = d.dayPayouts.find(x => x.player_id === p.player_id);
          return pp && (pp[t.key] || 0) > 0;
        });
        if (hasValue) {
          dayTypeCols.push({ ...d, typeKey: t.key, typeLabel: t.label });
        }
      }
    }

    const colCount = mainCols.length + dayTypeCols.length;
    const minWidth = 120 + colCount * 80 + 70;

    return (
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-accent" />
              Final Payouts
            </CardTitle>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-1">
              💡 Sub-payouts are raw calculated values. Totals are rounded to whole dollar — lower earners are rounded up first so the sum always equals the total purse.
            </p>
            <span className="text-xs text-muted-foreground">
              {holdMainPayouts
                ? `Main purse held until final round · side games per day`
                : `Main: $${Math.round(results.total_pot)}${results.deuce_pot > 0 ? ` · Deuce: $${Math.round(results.deuce_pot)}` : ""}${results.gross_skins_separate_pot > 0 ? ` · Gross Skins: $${Math.round(results.gross_skins_separate_pot)}` : ""}${results.net_skins_separate_pot > 0 ? ` · Net Skins: $${Math.round(results.net_skins_separate_pot)}` : ""}`}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="text-center text-xs text-foreground py-2 font-medium">
            ← Scroll →
          </div>
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-muted/30">
            <table className="text-sm border-collapse w-full" style={{ minWidth: `${minWidth}px` }}>
              <thead>
                <tr className="bg-muted/50">
                  <th className="sticky left-0 bg-muted/50 text-left font-semibold px-3 py-2 whitespace-nowrap text-xs z-10">Player</th>
                  {mainCols.map((c) => (
                    <th key={c.key} className="text-right font-semibold px-2 py-2 whitespace-nowrap text-xs">{c.label}</th>
                  ))}
                  {dayTypeCols.map((d) => (
                    <th key={`${d.dayLabel}-${d.typeKey}`} className="text-right font-semibold px-2 py-2 whitespace-nowrap text-xs">{d.dayLabel} {d.typeLabel}</th>
                  ))}
                  <th className="sticky right-0 bg-muted/50 text-right font-bold px-3 py-2 whitespace-nowrap text-xs z-10">Total</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p, i) => (
                  <tr key={p.player_id} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                    <td className="sticky left-0 z-10 font-medium px-3 py-2 whitespace-nowrap text-sm bg-inherit">{p.name}</td>
                    {mainCols.map((c) => (
                      <td key={c.key} className="text-right px-2 py-2 whitespace-nowrap text-accent text-sm font-medium">
                        {p[c.key] > 0 ? `$${p[c.key].toFixed(2)}` : "—"}
                      </td>
                    ))}
                    {dayTypeCols.map((d) => {
                      const pp = d.dayPayouts.find(x => x.player_id === p.player_id);
                      const v = pp ? (pp[d.typeKey] || 0) : 0;
                      return (
                        <td key={`${d.dayLabel}-${d.typeKey}`} className="text-right px-2 py-2 whitespace-nowrap text-accent text-sm font-medium">
                          {v > 0 ? `$${v.toFixed(2)}` : "—"}
                        </td>
                      );
                    })}
                    <td className="sticky right-0 z-10 text-right font-bold px-3 py-2 whitespace-nowrap text-lg bg-inherit">
                      ${Math.round(grandTotal(p))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Single-day layout (existing behavior) ──
  const allCols = [
    { key: "gross_payout", label: "Gross" },
    { key: "net_payout", label: "Net" },
    { key: "field_gross_payout", label: "Field Gross" },
    { key: "field_net_payout", label: "Field Net" },
    { key: "kp_payout", label: "KP" },
    { key: "gross_skins_payout", label: "Gross Skins" },
    { key: "net_skins_payout", label: "Net Skins" },
    { key: "deuce_payout", label: "Deuce" },
  ];

  const visibleCols = holdMainPayouts
    ? allCols.filter(c => c.key !== "gross_payout" && c.key !== "net_payout")
    : allCols;
  const cols = visibleCols.filter(c => payouts.some(p => p[c.key] > 0));

  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-accent" />
            Final Payouts
          </CardTitle>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-1">
            💡 Sub-payouts are raw calculated values. Totals are rounded to whole dollar — lower earners are rounded up first so the sum always equals the total purse.
          </p>
          <span className="text-xs text-muted-foreground">
            {holdMainPayouts
              ? `Main purse held until final round · side games only`
              : `Main: $${Math.round(results.total_pot)}${results.deuce_pot > 0 ? ` · Deuce: $${Math.round(results.deuce_pot)}` : ""}${results.gross_skins_separate_pot > 0 ? ` · Gross Skins: $${Math.round(results.gross_skins_separate_pot)}` : ""}${results.net_skins_separate_pot > 0 ? ` · Net Skins: $${Math.round(results.net_skins_separate_pot)}` : ""}`}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="text-center text-xs text-foreground py-2 font-medium">
          ← Scroll →
        </div>
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-muted/30">
          <table className="text-sm border-collapse w-full" style={{ minWidth: `${120 + cols.length * 80 + 70}px` }}>
            <thead>
              <tr className="bg-muted/50">
                <th className="sticky left-0 bg-muted/50 text-left font-semibold px-3 py-2 whitespace-nowrap text-xs z-10">Player</th>
                {cols.map(c => (
                  <th key={c.key} className="text-right font-semibold px-2 py-2 whitespace-nowrap text-xs">{c.label}</th>
                ))}
                <th className="sticky right-0 bg-muted/50 text-right font-bold px-3 py-2 whitespace-nowrap text-xs z-10">Total</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p, i) => (
                <tr key={p.player_id} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                  <td className="sticky left-0 z-10 font-medium px-3 py-2 whitespace-nowrap text-sm bg-inherit">{p.name}</td>
                  {cols.map(c => (
                    <td key={c.key} className="text-right px-2 py-2 whitespace-nowrap text-accent text-sm font-medium">
                       {p[c.key] > 0 ? `$${p[c.key].toFixed(2)}` : "—"}
                    </td>
                  ))}
                  <td className="sticky right-0 z-10 text-right font-bold px-3 py-2 whitespace-nowrap text-lg bg-inherit">
                    ${Math.round(holdMainPayouts ? cols.reduce((sum, c) => sum + (p[c.key] || 0), 0) : (p.total_payout != null ? p.total_payout : cols.reduce((sum, c) => sum + (p[c.key] || 0), 0)))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}