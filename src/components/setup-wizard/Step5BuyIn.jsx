import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { CalendarDays, Plus, Link2, Loader2, Layers } from 'lucide-react';
import InfoTooltip from '@/components/InfoTooltip';
import { toast } from 'sonner';

export default function Step5BuyIn({ form, updateForm, nextStep, prevStep, isAddDay }) {
  const isOff = form.game_mode === 'OFF';
  const isCustom = form.game_mode === 'CUSTOM';
  const isMultiDay = !!(form.is_multi_day || form.is_multi_flight);
  const isChild = !!form.parent_round_id;
  const quickOptions = isOff ? [0, 5, 10, 20, 50] : [5, 10, 11, 20, 50];
  const [customInput, setCustomInput] = useState('');
  const inputRef = useRef(null);

  // "new" = this round is the parent (Day 1); "add" = child linking to an existing parent
  const [attachMode, setAttachMode] = useState(isChild ? 'add' : 'new');
  const [parentOptions, setParentOptions] = useState([]);
  const [loadingParents, setLoadingParents] = useState(false);

  // Hybrid flight selection: when the parent tournament has both multi-day
  // and multi-flight enabled, the user must choose whether this round is a
  // new flight (new players, collects entry fee) or an additional day of an
  // existing flight (same players, buy-in = $0).
  const [hybridFlights, setHybridFlights] = useState([]);
  const [parentIsHybrid, setParentIsHybrid] = useState(false);

  // Local string state for percentage inputs so the user can clear the field
  // fully (a controlled number input that stores 0 when cleared gets stuck
  // showing "0" and can't be emptied).
  const [grossPctInput, setGrossPctInput] = useState(
    form.field_gross_percent != null ? String(form.field_gross_percent) : '30'
  );
  const [netPctInput, setNetPctInput] = useState(
    form.field_net_percent != null ? String(form.field_net_percent) : '30'
  );

  // Fetch the user's existing multi-day parent rounds (is_multi_day && no parent_round_id)
  useEffect(() => {
    if (!isMultiDay || attachMode !== 'add') return;
    let cancelled = false;
    setLoadingParents(true);
    const targetType = form.series_type || 'multi_day';
    base44.entities.Round.filter({ $or: [{ is_multi_day: true }, { is_multi_flight: true }] }, '-created_date', 50)
      .then(rounds => {
        if (cancelled) return;
        const parents = (rounds || []).filter(r => !r.parent_round_id && (r.series_type || 'multi_day') === targetType);
        setParentOptions(parents);
      })
      .catch(() => { if (!cancelled) setParentOptions([]); })
      .finally(() => { if (!cancelled) setLoadingParents(false); });
    return () => { cancelled = true; };
  }, [isMultiDay, attachMode, form.series_type, form.is_multi_flight]);

  const handleSelect = (amount) => {
    updateForm({ buy_in: amount });
    setTimeout(nextStep, 300);
  };

  const handleCustom = () => {
    const val = Number(customInput);
    if (customInput !== '' && !isNaN(val) && val >= 0) {
      updateForm({ buy_in: val });
      nextStep();
    }
  };

  const toggleMultiDaySeries = (checked) => {
    const isFlight = !!form.is_multi_flight;
    if (checked) {
      if (form.game_mode === 'SWIFT_SCORE_11') {
        updateForm({ is_multi_day: true, series_type: isFlight ? 'multi_flight' : 'multi_day', parent_round_id: null, game_mode: 'CUSTOM', custom_place_payout_percent: 100, custom_games_percent: 0 });
        toast.info('Switched to Custom Payouts — Fixed Payouts aren\'t available for multi-day series.');
      } else {
        updateForm({ is_multi_day: true, series_type: isFlight ? 'multi_flight' : 'multi_day', parent_round_id: null, custom_place_payout_percent: 100, custom_games_percent: 0 });
      }
      setAttachMode('new');
    } else {
      updateForm({ is_multi_day: false, parent_round_id: null, series_type: isFlight ? 'multi_flight' : 'multi_day' });
      setAttachMode('new');
    }
  };

  const toggleMultiFlight = (checked) => {
    if (checked) {
      if (form.game_mode === 'SWIFT_SCORE_11') {
        updateForm({ is_multi_flight: true, series_type: 'multi_flight', parent_round_id: null, game_mode: 'CUSTOM', custom_place_payout_percent: 100, custom_games_percent: 0 });
        toast.info('Switched to Custom Payouts — Fixed Payouts aren\'t available for multi-flight tournaments.');
      } else {
        updateForm({ is_multi_flight: true, series_type: 'multi_flight', parent_round_id: null, custom_place_payout_percent: 100, custom_games_percent: 0 });
      }
      setAttachMode('new');
    } else {
      // Keep multi-day as-is — the toggles are independent. If multi-day was
      // also on, it stays on. If only multi-flight was on (which set
      // is_multi_day=true), the user can turn off multi-day separately.
      updateForm({ is_multi_flight: false, series_type: 'multi_day', parent_round_id: null });
      setAttachMode('new');
    }
  };

  const chooseAttachMode = (mode) => {
    setAttachMode(mode);
    if (mode === 'new') {
      updateForm({ parent_round_id: null });
    } else {
      updateForm({ parent_round_id: null });
    }
  };

  const chooseParent = async (parentId) => {
    updateForm({ parent_round_id: parentId });
    // Inherit the parent's team config so the roster/count step shows the
    // correct inherited values for this child round. For multi-flight
    // tournaments, each flight has its OWN roster (different players), so
    // player_count is NOT inherited — only game settings carry over.
    // Multi-flight children also inherit the parent's buy-in (each flight
    // collects its own entry fee from its own players), unlike multi-day
    // where the fee was already collected on Day 1.
    try {
      const parent = await base44.entities.Round.filter({ id: parentId });
      const p = parent[0];
      if (p) {
        const isFlight = p.is_multi_flight || p.series_type === 'multi_flight';
        const parentHybrid = !!(p.is_multi_day && p.is_multi_flight);

        if (parentHybrid) {
          // Hybrid: fetch children to determine existing flights. The user
          // will choose "New Flight" or "Add Day to Flight X" next.
          setParentIsHybrid(true);
          const children = await base44.entities.Round.filter({ parent_round_id: parentId }, '-created_date', 200);
          const allRounds = [p, ...(children || [])].filter(Boolean);
          const flightMap = {};
          allRounds.forEach(r => {
            const fn = r.flight_number || 1;
            if (!flightMap[fn]) flightMap[fn] = { flight_number: fn, days: [], latestRound: r };
            flightMap[fn].days.push(r);
            if (new Date(r.date) > new Date(flightMap[fn].latestRound.date)) {
              flightMap[fn].latestRound = r;
            }
          });
          setHybridFlights(Object.values(flightMap).sort((a, b) => a.flight_number - b.flight_number));
          // Default to new flight (next number)
          const nextFlight = Math.max(...Object.keys(flightMap).map(Number), 0) + 1;
          updateForm({
            parent_round_id: parentId,
            flight_number: nextFlight,
            buy_in: p.buy_in ?? 0,
            series_type: p.series_type || 'multi_flight',
            is_multi_flight: true,
            is_multi_day: true,
            game_mode: p.game_mode,
            custom_place_payout_percent: p.custom_place_payout_percent ?? 100,
            custom_games_percent: p.custom_games_percent ?? 0,
            game_type: p.game_type,
            team_mode: p.team_mode,
            team_size: p.team_size,
            team_format: p.team_format,
            games: p.games,
            hcp_formula: p.hcp_formula,
          });
        } else {
          // Non-hybrid: existing behavior
          setParentIsHybrid(false);
          setHybridFlights([]);
          updateForm({
            parent_round_id: parentId,
            buy_in: isFlight ? (p.buy_in ?? 0) : 0,
            series_type: p.series_type || 'multi_day',
            is_multi_flight: p.is_multi_flight || p.series_type === 'multi_flight',
            game_mode: p.game_mode,
            custom_place_payout_percent: p.custom_place_payout_percent ?? 100,
            custom_games_percent: p.custom_games_percent ?? 0,
            ...(isFlight ? {} : { player_count: p.player_count }),
            game_type: p.game_type,
            team_mode: p.team_mode,
            team_size: p.team_size,
            team_format: p.team_format,
            games: p.games,
            hcp_formula: p.hcp_formula,
          });
        }
      }
    } catch { /* keep the minimal inheritance above */ }
  };

  // Select an existing flight to add a day to, or start a new flight.
  const chooseHybridFlight = (flightNumber, isNewFlight) => {
    if (isNewFlight) {
      updateForm({ flight_number: flightNumber, buy_in: form.buy_in || 0 });
    } else {
      // Adding a day to an existing flight: buy_in = 0 (already collected on
      // Day 1 of that flight), inherit player_count from that flight's Day 1.
      const flight = hybridFlights.find(f => f.flight_number === flightNumber);
      const day1 = flight?.days?.sort((a, b) => new Date(a.date) - new Date(b.date))[0];
      updateForm({
        flight_number: flightNumber,
        buy_in: 0,
        ...(day1 ? { player_count: day1.player_count } : {}),
      });
    }
  };

  const isFlight = !!form.is_multi_flight;
  const seriesLabel = isFlight ? 'Flight' : 'Day';
  const title = isAddDay
    ? `Add a Day to Flight ${form.flight_number || 1}`
    : isChild
      ? isFlight ? 'Add a Flight' : 'Add a Day to Series'
      : isMultiDay
        ? isFlight ? 'Tournament Buy-In' : 'Tournament Series Buy-In'
        : 'Buy-In Amount';

  const subtitle = isAddDay
    ? `Adding Day 2 to Flight ${form.flight_number || 1}. Entry fee is $0 — it was collected on Day 1. Configure this day's side games next.`
    : isChild
      ? isFlight
        ? `Each flight has its own players — set this flight's entry fee (inherits Flight 1's amount). The main purse pays out from Field Standings after the final flight.`
        : `The tournament entry fee was collected on ${seriesLabel} 1. Set this ${seriesLabel.toLowerCase()}'s buy-in to $0 — only side games are paid out today.`
    : isMultiDay
      ? isFlight
        ? 'Total entry fee per player for the entire tournament. The main purse pays out from Field Standings after the final flight.'
        : 'Total entry fee per player for the entire multi-day event. The main purse is held until the final round.'
      : 'What does each player contribute?';

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      </div>

      {isCustom && !isChild && (
        <div className="space-y-3">
          <div className={`flex items-center justify-between gap-3 rounded-xl border-2 p-4 transition-colors ${
            isMultiDay && !isFlight ? 'border-primary bg-primary/5' : 'border-border bg-secondary/50'
          }`}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg bg-accent/20 p-2 text-accent-foreground">
                <CalendarDays className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Multi-Day Series</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  Same players across multiple days. Scores summed for cumulative standings.
                </p>
              </div>
            </div>
            <Switch checked={!!form.is_multi_day} onCheckedChange={toggleMultiDaySeries} />
          </div>
          <div className={`flex items-center justify-between gap-3 rounded-xl border-2 p-4 transition-colors ${
            isFlight ? 'border-primary bg-primary/5' : 'border-border bg-secondary/50'
          }`}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg bg-accent/20 p-2 text-accent-foreground">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Multi-Flight Tournament</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  Different players per flight. Field standings rank all players together. Can be a single-day event.
                </p>
              </div>
            </div>
            <Switch checked={isFlight} onCheckedChange={toggleMultiFlight} />
          </div>
        </div>
      )}

      {!isCustom && !isChild && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-dashed border-border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg bg-accent/20 p-2 text-accent-foreground">
                <CalendarDays className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Multi-Day Series</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  Available with Custom Payouts only.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => updateForm({ game_mode: 'CUSTOM', custom_place_payout_percent: 100, custom_games_percent: 0 })}
              className="shrink-0 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              Use Custom
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-dashed border-border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg bg-accent/20 p-2 text-accent-foreground">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Multi-Flight Tournament</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  Available with Custom Payouts only.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => updateForm({ game_mode: 'CUSTOM', custom_place_payout_percent: 100, custom_games_percent: 0 })}
              className="shrink-0 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              Use Custom
            </button>
          </div>
        </div>
      )}

      {/* Field Prizes — shown when multi-flight is enabled on the parent round */}
      {isFlight && !isChild && (
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <p className="text-sm font-semibold text-foreground">Field Prizes</p>
              <InfoTooltip text="When enabled, a percentage of the total tournament pot is carved out for the lowest gross and lowest net scores across ALL flights combined. The engine automatically identifies the winners from field standings. Each flight still pays its own gross/net independently." />
            </div>
            <Switch
              checked={!!form.field_prizes_enabled}
              onCheckedChange={(checked) => {
                if (checked) {
                  setGrossPctInput(String(form.field_gross_percent ?? 30));
                  setNetPctInput(String(form.field_net_percent ?? 30));
                  updateForm({
                    field_prizes_enabled: true,
                    field_gross_percent: form.field_gross_percent ?? 30,
                    field_net_percent: form.field_net_percent ?? 30,
                  });
                } else {
                  updateForm({ field_prizes_enabled: false });
                }
              }}
            />
          </div>
          {form.field_prizes_enabled && (
            <>
              <p className="text-xs text-muted-foreground">Carved from the total tournament pot before flight payouts are calculated.</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Low Gross of Field (%)</p>
                  <input
                    type="number" min={0} max={100}
                    value={grossPctInput}
                    onChange={e => {
                      const raw = e.target.value.replace(/^0+(?=\d)/, '');
                      setGrossPctInput(raw);
                      updateForm({ field_gross_percent: raw === '' ? 0 : Number(raw) });
                    }}
                    className="w-full px-3 py-2 border-2 border-border rounded-lg text-base font-bold text-right bg-card text-foreground focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Low Net of Field (%)</p>
                  <input
                    type="number" min={0} max={100}
                    value={netPctInput}
                    onChange={e => {
                      const raw = e.target.value.replace(/^0+(?=\d)/, '');
                      setNetPctInput(raw);
                      updateForm({ field_net_percent: raw === '' ? 0 : Number(raw) });
                    }}
                    className="w-full px-3 py-2 border-2 border-border rounded-lg text-base font-bold text-right bg-card text-foreground focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>
              {(form.field_gross_percent ?? 22) + (form.field_net_percent ?? 22) > 50 && (
                <p className="text-xs text-amber-600">
                  ⚠️ Field prizes total {(form.field_gross_percent ?? 22) + (form.field_net_percent ?? 22)}% of the pot — flight payouts will be reduced accordingly.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {isMultiDay && !isAddDay && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => chooseAttachMode('new')}
              className={`flex flex-col items-start gap-1 p-4 rounded-xl border-2 text-left transition-all active:scale-95 ${
                attachMode === 'new'
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:border-primary/50'
              }`}
            >
              <Plus className="w-5 h-5 text-primary" />
              <span className="text-sm font-semibold text-foreground">{form.series_type === 'multi_flight' ? 'Start New Tournament' : 'Start New Series'}</span>
              <span className="text-xs text-muted-foreground">{form.series_type === 'multi_flight' ? 'This is Flight 1 — collect the entry fee.' : 'This is Day 1 — collect the entry fee.'}</span>
            </button>
            <button
              type="button"
              onClick={() => chooseAttachMode('add')}
              className={`flex flex-col items-start gap-1 p-4 rounded-xl border-2 text-left transition-all active:scale-95 ${
                attachMode === 'add'
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:border-primary/50'
              }`}
            >
              <Link2 className="w-5 h-5 text-primary" />
              <span className="text-sm font-semibold text-foreground">{form.series_type === 'multi_flight' ? 'Add a Flight' : 'Add a Day'}</span>
              <span className="text-xs text-muted-foreground">Link to an existing {form.series_type === 'multi_flight' ? 'tournament' : 'series'}.</span>
            </button>
          </div>

          {attachMode === 'add' && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Select the series to add this day to:</p>
              {loadingParents ? (
                <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading your series…
                </div>
              ) : parentOptions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    No multi-day series found. Start a new series first.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {parentOptions.map(r => {
                    const selected = form.parent_round_id === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => chooseParent(r.id)}
                        className={`w-full flex items-center justify-between gap-2 p-3 rounded-lg border-2 text-left transition-all active:scale-95 ${
                          selected
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-card hover:border-primary/50'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{r.event_name || 'Untitled Event'}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {r.course_name || 'No course'} · {r.date || 'No date'} · ${r.buy_in ?? 0}/player
                          </p>
                        </div>
                        {selected && <span className="text-xs font-semibold text-primary shrink-0">Selected</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Hybrid flight selection: when the parent tournament has both
                  multi-day and multi-flight, the user must choose whether this
                  round is a new flight or an additional day of an existing flight. */}
              {parentIsHybrid && form.parent_round_id && (
                <div className="space-y-2 pt-2">
                  <p className="text-xs font-medium text-muted-foreground">Is this a new flight or an additional day?</p>
                  <div className="space-y-2">
                    {hybridFlights.map(f => {
                      const selected = form.flight_number === f.flight_number && form.buy_in === 0;
                      return (
                        <button
                          key={f.flight_number}
                          type="button"
                          onClick={() => chooseHybridFlight(f.flight_number, false)}
                          className={`w-full flex items-center justify-between gap-2 p-3 rounded-lg border-2 text-left transition-all active:scale-95 ${
                            selected ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/50'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">Add Day to Flight {f.flight_number}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {f.days.length} day{f.days.length > 1 ? 's' : ''} played · buy-in $0
                            </p>
                          </div>
                          {selected && <span className="text-xs font-semibold text-primary shrink-0">Selected</span>}
                        </button>
                      );
                    })}
                    {(() => {
                      const nextFlight = Math.max(...hybridFlights.map(f => f.flight_number), 0) + 1;
                      const selected = form.flight_number === nextFlight && form.buy_in !== 0;
                      return (
                        <button
                          type="button"
                          onClick={() => chooseHybridFlight(nextFlight, true)}
                          className={`w-full flex items-center justify-between gap-2 p-3 rounded-lg border-2 text-left transition-all active:scale-95 ${
                            selected ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/50'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                              <Plus className="w-4 h-4 text-primary" /> New Flight {nextFlight}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              New players · buy-in ${form.buy_in ?? 0}
                            </p>
                          </div>
                          {selected && <span className="text-xs font-semibold text-primary shrink-0">Selected</span>}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {isChild && form.buy_in === 0 ? (
        <div className="rounded-lg bg-muted p-4 text-center">
          <p className="text-sm font-semibold text-foreground">Entry Fee: $0</p>
          <p className="text-xs text-muted-foreground mt-1">
            Entry fee already collected on Day 1 of this flight. Configure this day's side games next.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {quickOptions.map(amount => (
              <button
                key={amount}
                type="button"
                onClick={() => handleSelect(amount)}
                className={`py-5 px-4 border-2 rounded-xl font-bold text-xl transition-all active:scale-95 ${
                  form.buy_in === amount
                    ? 'border-primary bg-primary text-primary-foreground shadow-lg'
                    : 'border-border bg-card text-foreground hover:border-primary hover:bg-primary/10'
                }`}
              >
                ${amount}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Or enter custom amount:</p>
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                type="number"
                min="0"
                placeholder="0"
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCustom()}
                onFocus={() => setTimeout(() => inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 400)}
                className="flex-1 h-14 text-xl font-semibold border-2 border-border focus:border-primary"
              />
              <Button onClick={handleCustom} disabled={customInput === '' || Number(customInput) < 0} className="h-14 px-5 text-base">
                Set
              </Button>
            </div>
          </div>

          {isMultiDay && attachMode === 'new' && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">Note:</span> The {isFlight ? 'tournament' : 'series'} buy-in feeds the
                main tournament purse, settled after the final {seriesLabel.toLowerCase()}. Skins, KPs, and deuce pots are
                configured and paid out {seriesLabel.toLowerCase()}-by-{seriesLabel.toLowerCase()} in the Side Games step.
              </p>
            </div>
          )}
        </>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={prevStep} className="flex-1 py-2 px-4 rounded-md border-2 border-border bg-card text-foreground font-medium text-sm">
          Back
        </button>
        {isChild && (
          <button type="button" onClick={nextStep} className="flex-1 py-2 px-4 rounded-md bg-primary text-primary-foreground font-semibold text-sm">
            Next
          </button>
        )}
      </div>
    </div>
  );
}