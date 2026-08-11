import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function getAchievementLabel(score, par) {
  if (score === null || score === undefined || score === 'X') return null;
  const numScore = Number(score);
  if (isNaN(numScore)) return null;
  const diff = numScore - par;
  if (diff <= -5) return 'Ostrich';
  if (diff === -4) return 'Condor';
  if (diff === -3) return 'Albatross';
  if (diff === -2) return 'Eagle';
  if (diff === -1) return 'Birdie';
  if (diff === 0) return 'Par';
  if (diff === 1) return 'Bogey';
  if (diff === 2) return 'Double';
  return `+${diff}`;
}

export default function SkinsTable({ title, skins, totalPot, par }) {
  const noSkins = !skins || skins.length === 0;

  const grandTotal = (skins || []).reduce((sum, skin) => sum + (skin.value || 0), 0);
  const totalSkinsWon = (skins || []).reduce((sum, skin) => sum + 1 + (skin.carryover_from?.length || 0), 0);

  const displayPot = totalPot > 0 ? totalPot : grandTotal;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          {displayPot > 0 && (
            <span className="text-sm font-semibold text-accent">${displayPot.toFixed(2)} pot</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {noSkins ? (
          <p className="text-sm text-muted-foreground">No skins won this round.</p>
        ) : (
          skins.map((skin) => {
            const numSkinsWon = 1 + (skin.carryover_from?.length || 0);
            const holePar = par?.[skin.hole - 1];
            const achievementLabel = (holePar != null && skin.score != null && skin.score !== 'X')
              ? getAchievementLabel(skin.score, holePar)
              : skin.achievement;
            return (
              <div key={`${skin.player_id}-${skin.hole}`} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/30">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-foreground font-medium">
                      {skin.name} — Hole {skin.hole}
                    </span>
                    {achievementLabel && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-yellow-100 text-yellow-700">
                        {achievementLabel}
                      </span>
                    )}
                  </div>
                  {skin.carryover_from?.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      carries {skin.carryover_from.join(', ')}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="bg-accent/20 px-2.5 py-1 rounded-md text-center">
                    <div className="text-xs text-muted-foreground font-medium">skins</div>
                    <div className="text-lg font-bold text-accent">{numSkinsWon}</div>
                  </div>
                  <span className="text-sm text-accent font-semibold whitespace-nowrap">+${(skin.value || 0).toFixed(2)}</span>
                </div>
              </div>
            );
          })
        )}
        {!noSkins && skins.length > 1 && (
          <div className="mt-1 pt-3 border-t border-border">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50">
              <span className="text-sm font-semibold text-foreground">Total Paid Out</span>
              <span className="text-sm font-bold text-foreground">${skins.reduce((sum, s) => sum + (s.value || 0), 0).toFixed(2)}</span>
            </div>
          </div>
        )}
        </CardContent>
        </Card>
        );
        }