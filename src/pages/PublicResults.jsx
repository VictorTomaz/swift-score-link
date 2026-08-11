import React, { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, DollarSign, Calendar, CalendarDays, Share2, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import InfoTooltip from "@/components/InfoTooltip";
import GrossNetResults from "@/components/results/GrossNetResults";
import TeamStandings from "@/components/results/TeamStandings";
import SkinsTable from "@/components/results/SkinsTable";
import PayoutTable from "@/components/results/PayoutTable";

export default function PublicResults() {
  const navigate = useNavigate();
  const { roundId } = useParams();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const { data: round, isLoading } = useQuery({
    queryKey: ["round", roundId],
    queryFn: async () => {
      const rounds = await base44.entities.Round.filter({ id: roundId });
      return rounds[0];
    },
    enabled: !!roundId,
  });

  // Multi-day series: hold the main (gross/net) purse until the final round.
  const { data: isFinalDay = false } = useQuery({
    queryKey: ["series-final-day", round?.id],
    queryFn: async () => {
      if (!round || !round.is_multi_day || !round.parent_round_id) return false;
      const children = await base44.entities.Round.filter({ parent_round_id: round.parent_round_id });
      const sorted = [...(children || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
      return sorted[0]?.id === round.id;
    },
    enabled: !!round,
  });
  const isMultiDay = !!round?.is_multi_day;
  const holdMainPayouts = isMultiDay && !isFinalDay;

  // Public results are read-only — no recompute needed here

  const handleShare = async () => {
    const shareUrl = window.location.href;
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert("Link copied to clipboard!");
    } catch {
      alert("Copy this link: " + shareUrl);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!round || !round.results) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Results not available.</p>
        <Button onClick={() => navigate("/")} className="mt-4">Back to Home</Button>
      </div>
    );
  }

  // Check if round is public
  if (!round.is_public) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">This round is private. Contact the organizer for access.</p>
        <Button onClick={() => navigate("/")} className="mt-4">Back to Home</Button>
      </div>
    );
  }

  const results = round.results;
  const kpResults = results.kp_results || [];

  const showGrossSkins = round.gross_skins_enabled || (results.gross_skins_allocated_pot > 0) || (results.gross_skins_separate_pot > 0) || (results.gross_skins?.length > 0);
  const showNetSkins = round.net_skins_enabled || (results.net_skins_allocated_pot > 0) || (results.net_skins_separate_pot > 0) || (results.net_skins?.length > 0);

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4 pb-20">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{round.event_name}</h1>
            <p className="text-sm text-muted-foreground">{round.course_name} • {round.date}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleShare} className="gap-2">
            <Share2 className="w-4 h-4" />
            Share
          </Button>
        </div>

        {/* Pot breakdown */}
        {results.total_pot > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              ...(!holdMainPayouts && results.gross_pot > 0 ? [{ label: "Gross Pot", value: results.gross_pot, places: results.gross_places, tip: "The portion of the main pot allocated to gross score standings." }] : []),
              ...(!holdMainPayouts && results.net_pot > 0 ? [{ label: "Net Pot", value: results.net_pot, places: results.net_places, tip: "The portion of the main pot allocated to net score standings." }] : []),
              ...(results.side_pot > 0 ? [{ label: "Side Games", value: results.side_pot, tip: "Pot allocated to side games like skins and KPs." }] : []),
              ...(results.kp_separate_pot > 0 ? [{ label: "KP Pot", value: results.kp_separate_pot, tip: "Separate pot funded by KP buy-ins." }] : []),
              ...(results.deuce_pot > 0 ? [{ label: "Deuce Pot", value: results.deuce_pot, tip: "Separate pot funded by deuce buy-ins." }] : []),
            ].map(item => (
              <Card key={item.label} className="border-0 shadow-sm">
                <CardContent className="p-3 text-center">
                  <p className="text-[10px] text-muted-foreground font-medium flex items-center justify-center gap-0.5">
                    {item.label}{item.tip && <InfoTooltip text={item.tip} />}
                  </p>
                  <p className="text-base font-bold text-foreground mt-0.5">${Math.round(item.value || 0)}</p>
                  {item.places && item.places.length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1">{item.places.map(p => `$${Math.round(p)}`).join(' + ')}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {holdMainPayouts && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-primary/10 border border-primary/30 p-3">
            <CalendarDays className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-sm text-foreground leading-relaxed">
              <span className="font-semibold">Multi-Day Series — Main purse held.</span>{" "}
              Gross &amp; net payouts are held until the final round. Only side games
              (skins, KPs, deuces) settle today.
            </p>
          </div>
        )}

        {/* Gross & Net standings — team format shows team standings */}
        <div className="mt-2">
          {round.game_type && round.game_type !== "individual" ? (
            <TeamStandings results={results} round={round} players={round.players || []} editMode={false} holdMainPayouts={holdMainPayouts} />
          ) : (
            <GrossNetResults results={results} round={round} editMode={false} holdMainPayouts={holdMainPayouts} />
          )}
        </div>

        {/* Gross Skins */}
        {showGrossSkins && (
          <div className="mt-3">
            <SkinsTable
              title="⛳ Gross Skins"
              skins={results.gross_skins || []}
              totalPot={results.gross_skins_allocated_pot || results.gross_skins_separate_pot || 0}
              par={round.par}
            />
          </div>
        )}

        {/* Net Skins */}
        {showNetSkins && (
          <div className="mt-3">
            <SkinsTable
              title="🎯 Net Skins"
              skins={results.net_skins || []}
              totalPot={results.net_skins_allocated_pot || results.net_skins_separate_pot || 0}
              par={round.par}
            />
          </div>
        )}

        {/* KP Winners */}
        {kpResults.length > 0 && (
          <Card className="border-0 shadow-sm mt-3">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-accent" /> KP Winners
                </h3>
                {results.kp_separate_pot > 0 && (
                  <span className="text-sm font-semibold text-accent">${Math.round(results.kp_separate_pot)} pot</span>
                )}
              </div>
              <div className="space-y-2">
                {(() => {
                  const kpFoldedIntoSkins = !round.kp_separate_buy_in && (round.gross_skins_enabled || round.net_skins_enabled);
                  const perEntryAmount = Number(results.kp_per_entry_amount) || 0;
                  return kpResults.map((kp, i) => {
                    const playerName = round.players?.find(p => p.player_id === kp.player_id)?.name || kp.player_id;
                    return (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50">
                        <div>
                          <span className="font-medium text-sm">{playerName}</span>
                          <span className="text-xs text-muted-foreground ml-2">Hole {kp.hole}</span>
                        </div>
                        {perEntryAmount > 0 ? (
                          <span className="text-sm font-semibold" style={{ color: '#d4a017' }}>+${perEntryAmount.toFixed(2)}</span>
                        ) : kpFoldedIntoSkins ? (
                          <span className="text-xs text-muted-foreground italic">included in skins</span>
                        ) : null}
                      </div>
                    );
                  });
                })()}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Deuce Pot */}
        {round.deuce_pot_enabled && (
          <Card className="border-0 shadow-sm mt-3">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold flex items-center gap-2">✌️ Deuce Pot</h3>
                <span className="text-sm font-semibold text-accent">${Math.round(results.deuce_pot || 0)} pot</span>
              </div>
              {results.deuces?.length > 0 ? (
                <div className="space-y-2">
                  {results.deuces.map((d, i) => {
                    const playerName = round.players?.find(p => p.player_id === d.player_id)?.name || d.player_id;
                    const perDeuceAmount = results.deuce_per_entry_amount || 0;
                    return (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50">
                        <div>
                          <span className="font-medium text-sm">{playerName}</span>
                          <span className="text-xs text-muted-foreground ml-2">Hole {d.hole}</span>
                        </div>
                        <span className="text-sm font-semibold" style={{ color: '#d4a017' }}>+${perDeuceAmount.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No deuces this round.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Payout Table */}
        <div className="mt-3">
          <PayoutTable results={results} holdMainPayouts={holdMainPayouts} />
        </div>
      </motion.div>
    </div>
  );
}