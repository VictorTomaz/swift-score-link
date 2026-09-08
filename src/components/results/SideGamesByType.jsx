import React from "react";
import SkinsTable from "@/components/results/SkinsTable";
import SideGameTypeGroup from "@/components/results/SideGameTypeGroup";
import KpWinnersCard from "@/components/results/KpWinnersCard";
import DeucePotCard from "@/components/results/DeucePotCard";

/**
 * Side games grouped by TYPE instead of by day: all Gross Skins across every
 * day/flight, then all Net Skins, then all KPs, then all Deuce Pots. Each
 * entry inside a group is sub-labeled with its day/flight.
 *
 * `entries` must already be ordered day-then-flight; each entry is
 * { key, label, round, results, suppressKP, playerFlightMap, flightLabels, flightDayLabels }.
 */
export default function SideGamesByType({ entries = [], teamNameByPlayer }) {
  const showGross = (e) => e.round.gross_skins_enabled || e.results.gross_skins_allocated_pot > 0 ||
    e.results.gross_skins_separate_pot > 0 || e.results.gross_skins?.length > 0;
  const showNet = (e) => e.round.net_skins_enabled || e.results.net_skins_allocated_pot > 0 ||
    e.results.net_skins_separate_pot > 0 || e.results.net_skins?.length > 0;

  return (
    <div className="space-y-3">
      <SideGameTypeGroup title="⛳ Gross Skins">
        {entries.filter(showGross).map(e => (
          <SkinsTable
            key={`gs-${e.key}`}
            title={e.label}
            skins={e.results.gross_skins || []}
            totalPot={e.results.gross_skins_allocated_pot || e.results.gross_skins_separate_pot || 0}
            par={e.round.par || []}
          />
        ))}
      </SideGameTypeGroup>

      <SideGameTypeGroup title="🎯 Net Skins">
        {entries.filter(showNet).map(e => (
          <SkinsTable
            key={`ns-${e.key}`}
            title={e.label}
            skins={e.results.net_skins || []}
            totalPot={e.results.net_skins_allocated_pot || e.results.net_skins_separate_pot || 0}
            par={e.round.par || []}
          />
        ))}
      </SideGameTypeGroup>

      <SideGameTypeGroup title="KP Winners">
        {entries.filter(e => !e.suppressKP && (e.results.kp_results?.length > 0)).map(e => (
          <KpWinnersCard
            key={`kp-${e.key}`}
            round={e.round}
            results={e.results}
            title={e.label}
            playerFlightMap={e.playerFlightMap}
            flightLabels={e.flightLabels}
            flightDayLabels={e.flightDayLabels}
            teamNameByPlayer={teamNameByPlayer}
          />
        ))}
      </SideGameTypeGroup>

      <SideGameTypeGroup title="Deuce Pot">
        {entries.filter(e => e.round.deuce_pot_enabled).map(e => (
          <DeucePotCard key={`dp-${e.key}`} round={e.round} results={e.results} title={e.label} teamNameByPlayer={teamNameByPlayer} />
        ))}
      </SideGameTypeGroup>
    </div>
  );
}