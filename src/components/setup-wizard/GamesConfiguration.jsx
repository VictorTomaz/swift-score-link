import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Users, User } from 'lucide-react';
import InfoTooltip from '@/components/InfoTooltip';
import Segments666Config, { defaultSegments666 } from '@/components/setup-wizard/Segments666Config';
import VegasAllowanceInput from '@/components/setup-wizard/VegasAllowanceInput';

const FORMATS = [
  { value: 'stroke_play', label: 'Stroke Play', desc: 'Standard individual scores', type: 'individual', rec: 'Rec: 95% individual' },
  { value: 'best_ball', label: 'Best Ball', desc: 'Best score per hole', type: 'team', rec: 'Rec: 85% four-ball' },
  { value: 'scramble', label: 'Scramble', desc: 'One team score per hole', type: 'team', rec: 'Rec: 25%/15% (4-player USGA)' },
  { value: 'chapman', label: 'Chapman', desc: 'Team bookend format', type: 'team', rec: 'Rec: 60% low / 40% high' },
  { value: '6_6_6', label: '6-6-6', desc: 'Multiple formats', type: 'team', rec: 'Rec: per-segment format allowance' },
  { value: 'aggregate', label: 'Aggregate', desc: 'Sum of all team scores', type: 'team', rec: 'Rec: 100% combined' },
  { value: 'las_vegas', label: 'Las Vegas', desc: '1 gross + 2 net per hole', type: 'team', rec: 'Rec: 85% individual allowance' },
  { value: 'stableford', label: 'Stableford', desc: 'Points-based scoring', type: 'individual', rec: 'Rec: 95% individual' },
];

const HCP_FORMULAS = [
  { value: 'none', label: 'No Handicap' },
  { value: 'individual', label: 'Individual (Per-Player Handicap)' },
  { value: 'combined_avg', label: 'Combined Average' },
  { value: 'avg_30', label: '70% of Combined Average' },
  { value: 'combined_85', label: '85% of Combined' },
  { value: 'usga_scramble', label: 'USGA Scramble (25% Low / 15% High)' },
  { value: 'split_60_40', label: '60/40 (60% Low / 40% High)' },
  { value: 'split_35_15', label: '35/15 (35% Low / 15% High)' },
  { value: 'sum', label: 'Full Combined (Sum)' },
];

const genId = () => `game_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// Sync games array → legacy fields for backward compatibility
function syncLegacy(games) {
  const main = games.find(g => g.is_main) || games[0];
  if (!main) return {};
  const isTeam = main.type === 'team';
  const legacyType = isTeam
    ? (main.format === 'best_ball' ? 'team_best_ball'
      : main.format === 'scramble' ? 'team_scramble'
      : main.format === 'chapman' ? 'team_chapman'
      : main.format === '6_6_6' ? 'team_6_6_6'
      : main.format === 'aggregate' ? 'team_aggregate'
      : main.format === 'las_vegas' ? 'team_las_vegas'
      : 'team_best_ball')
    : 'individual';
  const isVegas = main.format === 'las_vegas';
  return {
    game_type: legacyType,
    team_mode: isTeam,
    team_format: ['scramble', 'aggregate', 'las_vegas'].includes(main.format) ? main.format : 'best_ball',
    // Las Vegas counts three balls per hole, so it needs 3- or 4-player teams.
    team_size: isVegas ? Math.max(main.team_size || 4, 3) : (main.team_size || 2),
    hcp_formula: main.hcp_formula || (isTeam ? 'avg_30' : 'combined_85'),
  };
}

export default function GamesConfiguration({ form, updateForm, nextStep, prevStep }) {
  const isChild = !!form.parent_round_id;

  // Initialize games array from form, or build from legacy fields
  const [games, setGames] = useState(() => {
    if (form.games && form.games.length > 0) return form.games;
    // Migrate from legacy fields
    const isTeam = form.game_type && form.game_type !== 'individual';
    const format = isTeam
      ? (form.game_type === 'team_scramble' ? 'scramble'
        : form.game_type === 'team_chapman' ? 'chapman'
        : form.game_type === 'team_6_6_6' ? '6_6_6'
        : form.game_type === 'team_aggregate' ? 'aggregate'
        : form.game_type === 'team_las_vegas' ? 'las_vegas'
        : 'best_ball')
      : 'stroke_play';
    return [{
      id: genId(),
      name: 'Main Event',
      type: isTeam ? 'team' : 'individual',
      format,
      buy_in: form.buy_in || 0,
      is_main: true,
      team_size: form.team_size || 2,
      hcp_formula: form.hcp_formula || (isTeam ? 'avg_30' : 'combined_85'),
      places_paid: 3,
    }];
  });

  // When editing an existing round, the saved `games` array arrives after mount
  // (loaded async by SetupWizard). Sync local state so the saved team/individual
  // selection is preserved instead of reverting to the default.
  useEffect(() => {
    if (form.games && form.games.length > 0) {
      setGames(form.games);
    }
  }, [form.games]);

  const commit = (updated) => {
    setGames(updated);
    updateForm({ games: updated, ...syncLegacy(updated) });
  };

  const updateGame = (id, patch) => {
    if (isChild) return;
    const updated = games.map(g => g.id === id ? { ...g, ...patch } : g);
    const main = updated.find(g => g.is_main) || updated[0];
    // Fixed payouts (SWIFT_SCORE_11) aren't supported for team formats —
    // bump the mode back to Custom so the next step stays valid.
    const becomingTeam = main?.type === 'team';
    const formPatch = {};
    if (becomingTeam && form.game_mode === 'SWIFT_SCORE_11') {
      formPatch.game_mode = 'CUSTOM';
    }
    commit(updated);
    if (Object.keys(formPatch).length) updateForm(formPatch);
  };

  const mainGame = games.find(g => g.is_main) || games[0];
  // Scramble, Chapman, and 6-6-6 use a single team score per hole, so skins can't be
  // individual in these formats — force team skins on and lock the toggle.
  const noIndividualSkins = ['scramble', 'chapman', '6_6_6'].includes(mainGame?.format);
  // Las Vegas counts 1 gross + 2 net every hole, so teams must have 3 or 4 players.
  const isVegas = mainGame?.format === 'las_vegas';
  const teamSizeOptions = isVegas ? [3, 4] : [2, 3, 4];
  // Aggregate and Las Vegas: side games stay individual — each player competes
  // on their own even though the main event is a team game.
  const aggregateForcesIndividualSkins = mainGame?.format === 'aggregate' || isVegas;

  return (
  <div className="p-6 space-y-6">
    <div>
      <h2 className="text-lg font-bold text-foreground">Games</h2>
      <p className="text-sm text-muted-foreground mt-1">
        {isChild
          ? 'Game format is inherited from Day 1 of this series.'
          : 'Configure your main event as individual or team play.'}
      </p>
    </div>

    {isChild && (
      <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">Locked:</span> The main game format
          (individual/team, scoring type, handicap formula) is inherited from Day 1 and can't be
          changed on a subsequent day. Configure this day's side games in the Side Games step.
        </p>
      </div>
    )}

    {/* Main Game */}
    <div className={`space-y-3 ${isChild ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-primary bg-primary/10 px-2 py-1 rounded">Main Event</span>
      </div>
      {mainGame && (
        <div className="space-y-3 p-4 rounded-lg border-2 border-primary/30 bg-primary/5">
          {/* Type toggle */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Scoring Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isChild}
                onClick={() => !isChild && updateGame(mainGame.id, {
                  type: 'individual',
                  format: mainGame.format === 'stroke_play' || mainGame.format === 'stableford' ? mainGame.format : 'stroke_play'
                })}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${mainGame.type === 'individual' ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/50'} ${isChild ? 'cursor-not-allowed' : ''}`}
              >
                <User className="w-4 h-4" /> Individual
              </button>
              <button
                type="button"
                disabled={isChild}
                onClick={() => !isChild && updateGame(mainGame.id, {
                  type: 'team',
                  format: ['best_ball', 'scramble', 'chapman', '6_6_6', 'aggregate', 'las_vegas'].includes(mainGame.format) ? mainGame.format : 'best_ball',
                  // Default team handicap formula to 70% of Combined Average when switching to team play
                  ...(mainGame.type !== 'team' ? { hcp_formula: 'avg_30' } : {})
                })}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${mainGame.type === 'team' ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/50'} ${isChild ? 'cursor-not-allowed' : ''}`}
              >
                <Users className="w-4 h-4" /> Team
              </button>
            </div>
          </div>

          {/* Format */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Format</label>
            <div className="grid grid-cols-2 gap-2">
              {FORMATS.filter(f => f.type === mainGame.type).map(f => (
                <button
                  key={f.value}
                  type="button"
                  disabled={isChild}
                  onClick={() => {
                    if (isChild) return;
                    updateGame(mainGame.id, {
                      format: f.value,
                      // Las Vegas needs 3 or 4 players per team
                      ...(f.value === 'las_vegas' ? { team_size: Math.max(mainGame.team_size || 4, 3) } : {}),
                    });
                    if (['scramble', 'chapman', '6_6_6'].includes(f.value)) {
                      updateForm({ skins_team_mode: true });
                    }
                    if (f.value === 'aggregate' || f.value === 'las_vegas') {
                      updateForm({ skins_team_mode: false });
                    }
                    if (f.value === '6_6_6' && (!form.segments_666 || form.segments_666.length !== 3)) {
                      updateForm({ segments_666: defaultSegments666() });
                    }
                  }}
                  className={`p-2.5 rounded-lg border-2 text-left transition-all ${mainGame.format === f.value ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'} ${isChild ? 'cursor-not-allowed' : ''}`}
                >
                  <p className="font-semibold text-foreground text-xs">{f.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{f.desc}</p>
                  {f.rec && <p className="text-[10px] text-muted-foreground/80 mt-0.5 italic">{f.rec}</p>}
                </button>
              ))}
            </div>
          </div>

          {/* Team settings */}
          {mainGame.type === 'team' && (
            <>
              <div className="flex items-center justify-between pt-2 border-t border-primary/20">
                <Label className="text-sm flex items-center text-foreground">Team Side Games <InfoTooltip text="When on, skins, KP, and Deuce Pot winnings are won by the team (skins use the lowest team best-ball per hole) and split equally among members. When off, each player competes individually for all side games even in a team-format round." /></Label>
                <Switch
                  checked={noIndividualSkins ? true : aggregateForcesIndividualSkins ? false : form.skins_team_mode !== false}
                  disabled={isChild || noIndividualSkins || aggregateForcesIndividualSkins}
                  onCheckedChange={v => updateForm({ skins_team_mode: v })}
                />
              </div>
              <p className="text-xs text-muted-foreground leading-snug">
                {noIndividualSkins
                  ? 'Skins, KPs, and Deuces are won by the team — winnings split equally among all members.'
                  : aggregateForcesIndividualSkins
                    ? `Off: side games are individual in ${isVegas ? 'Las Vegas' : 'Aggregate'} format — each player competes on their own.`
                    : (form.skins_team_mode !== false
                      ? 'On: skins, KPs, and Deuces are won by the team and split equally among members.'
                      : 'Off: each player competes individually for skins, KPs, and Deuces, even in a team-format round.')}
              </p>
              {noIndividualSkins && (
                <p className="text-xs text-muted-foreground italic">Side games must be team-based for this format — individual side games aren't available.</p>
              )}
              {aggregateForcesIndividualSkins && (
                <p className="text-xs text-muted-foreground italic">Team side games aren't available in {isVegas ? 'Las Vegas' : 'Aggregate'} — skins, KPs, and Deuces are per individual player.</p>
              )}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Team Size{isVegas ? ' (3 or 4 — three balls count each hole)' : ''}
                </label>
                <div className="flex gap-2">
                  {teamSizeOptions.map(n => (
                    <button
                      key={n}
                      type="button"
                      disabled={isChild}
                      onClick={() => !isChild && updateGame(mainGame.id, { team_size: n })}
                      className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all ${(mainGame.team_size || 2) === n ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'} ${isChild ? 'cursor-not-allowed' : ''}`}
                    >
                      {n}P
                    </button>
                  ))}
                </div>
              </div>
              {!isVegas && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Handicap Formula</label>
                <select
                  value={mainGame.hcp_formula || 'combined_85'}
                  onChange={e => updateGame(mainGame.id, { hcp_formula: e.target.value })}
                  disabled={isChild}
                  className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {HCP_FORMULAS.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              )}
              {isVegas && (
                <VegasAllowanceInput
                  round={form}
                  value={form.vegas_hcp_percent}
                  onChange={(v) => updateForm({ vegas_hcp_percent: v })}
                  disabled={isChild}
                />
              )}
              {isVegas && (
                <div className="rounded-lg bg-accent/10 border border-accent/30 p-3">
                  <p className="text-xs text-foreground leading-relaxed">
                    <span className="font-semibold">Las Vegas — 1 Gross / 2 Net.</span> Each hole counts
                    three balls: one player's gross plus two others' net. The app tries every combination
                    and keeps the lowest total, so the gross ball isn't locked to the low raw score.
                    Teams are ranked on one combined leaderboard paid from a single pot. Side games
                    (skins, KPs, Deuces) are individual — each player plays for their own.
                  </p>
                </div>
              )}
              {mainGame.format === '6_6_6' && (
                <div className={isChild ? 'opacity-60 pointer-events-none' : ''}>
                  <Segments666Config
                    segments={form.segments_666}
                    onChange={(segments) => updateForm({ segments_666: segments })}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>

    <div className="flex gap-2">
      <Button variant="outline" onClick={prevStep} className="flex-1">Back</Button>
      <Button onClick={nextStep} disabled={!mainGame} className="flex-1">Next</Button>
    </div>
  </div>
  );
}