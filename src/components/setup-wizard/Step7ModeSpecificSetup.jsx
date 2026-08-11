import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, ChevronDown } from 'lucide-react';
import CustomModeSettings from '@/components/newround/CustomModeSettings';
import InfoTooltip from '@/components/InfoTooltip';

function BuyInInput({ value, onChange }) {
  const [local, setLocal] = useState(String(value ?? ''));
  return (
    <input
      type="text"
      inputMode="decimal"
      min="1"
      value={local}
      onChange={e => {
        setLocal(e.target.value);
        const n = parseFloat(e.target.value);
        if (!isNaN(n)) onChange(n);
      }}
      onBlur={() => {
        const n = parseFloat(local);
        if (isNaN(n) || local === '') { setLocal('5'); onChange(5); }
        else setLocal(String(n));
      }}
      className="w-24 px-3 py-2 border-2 border-border rounded-lg text-lg font-bold text-right bg-card text-foreground focus:outline-none focus:border-primary transition-colors"
    />
  );
}

export default function Step7ModeSpecificSetup({ form, updateForm, nextStep, prevStep, onComplete, loading }) {
  const isOff = form.game_mode === 'OFF';
  const isFixed = form.game_mode === 'SWIFT_SCORE_11';
  const isCustom = form.game_mode === 'CUSTOM';
  const isMultiDay = !!form.is_multi_day;
  const scrollRef = useRef(null);
  const [showScrollHint, setShowScrollHint] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => setShowScrollHint(el.scrollHeight > el.clientHeight && el.scrollTop + el.clientHeight < el.scrollHeight - 10);
    check();
    el.addEventListener('scroll', check);
    window.addEventListener('resize', check);
    return () => { el.removeEventListener('scroll', check); window.removeEventListener('resize', check); };
  }, []);

  // Auto-reset KP mode when both skins are enabled (KP can't be "part of skins" in this case)
  useEffect(() => {
    if (form.gross_skins_enabled && form.net_skins_enabled && form.kp_mode === 'part_of_skins') {
      updateForm({ kp_mode: 'separate', kps_enabled: true, kp_separate_buy_in: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.gross_skins_enabled, form.net_skins_enabled]);

  // Multi-day series: the main purse is held until the final round, so side games
  // must use their own separate buy-in to settle day-by-day. Force it on and lock it.
  useEffect(() => {
    if (isMultiDay) {
      const updates = {};
      if (form.kp_mode === 'part_of_skins') updates.kp_mode = 'separate', updates.kps_enabled = true, updates.kp_separate_buy_in = true;
      if (form.gross_skins_enabled && !form.gross_skins_separate_buy_in) updates.gross_skins_separate_buy_in = true;
      if (form.net_skins_enabled && !form.net_skins_separate_buy_in) updates.net_skins_separate_buy_in = true;
      if (Object.keys(updates).length) updateForm(updates);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiDay]);

  const handleFinish = () => {
    onComplete();
  };

  return (
    <div className="relative">
    <div ref={scrollRef} className="p-6 space-y-6 max-h-96 overflow-y-auto pb-10">
      <div>
        <h2 className="text-xl font-bold text-foreground">{isCustom ? 'Custom Mode Settings' : 'Side Games Setup'}</h2>
        <p className="text-sm text-muted-foreground mt-1">{isCustom ? 'Configure payout splits and places paid' : 'Configure optional side games'}</p>
      </div>

      {isCustom && <CustomModeSettings form={form} update={updateForm} />}

      {isMultiDay && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">Multi-Day Series:</span> The main purse is held
            until the final round, so side games must use a separate buy-in to settle day-by-day.
          </p>
        </div>
      )}

      {/* KPs */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-foreground">KPs (Closest to Pin)</p>
        
        <div className="space-y-2">
          {isOff ? (
            <>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Off</Label>
                <button
                  type="button"
                  onClick={() => updateForm({ kp_mode: 'off', kps_enabled: false })}
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    form.kp_mode === 'off' || !form.kps_enabled
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border text-foreground hover:bg-muted'
                  }`}
                >
                  Off
                </button>
              </div>
              <div className="flex items-center justify-between">
                <Label className={`text-sm ${form.gross_skins_enabled && form.net_skins_enabled ? 'text-muted-foreground' : ''}`}>Part of Skins</Label>
                <button
                  type="button"
                  disabled={form.gross_skins_enabled && form.net_skins_enabled}
                  onClick={() => updateForm({ kp_mode: 'part_of_skins', kps_enabled: true, kp_separate_buy_in: false, kp_counts_as_skin: true })}
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    form.gross_skins_enabled && form.net_skins_enabled
                      ? 'border border-border text-muted-foreground cursor-not-allowed opacity-50'
                      : form.kp_mode === 'part_of_skins'
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border text-foreground hover:bg-muted'
                  }`}
                >
                  Part of Skins
                </button>
              </div>
              {form.gross_skins_enabled && form.net_skins_enabled && (
                <p className="text-xs text-muted-foreground italic">Both skins types enabled — KP must use a separate buy-in.</p>
              )}
              <div className="flex items-center justify-between">
                <Label className="text-sm">Separate Buy-In</Label>
                <button
                  type="button"
                  onClick={() => updateForm({ kp_mode: 'separate', kps_enabled: true, kp_separate_buy_in: true })}
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    form.kp_mode === 'separate'
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border text-foreground hover:bg-muted'
                  }`}
                >
                  Buy-In
                </button>
              </div>
              {form.kp_separate_buy_in && form.kp_mode === 'separate' && (
                <div className="flex items-center justify-between pt-2 border-t">
                  <Label className="text-sm">KP Buy-In ($)</Label>
                  <BuyInInput value={form.kp_buy_in} onChange={v => updateForm({ kp_buy_in: v })} />
                </div>
              )}
            </>
          ) : isFixed ? (
            <>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Off</Label>
                <button
                  type="button"
                  onClick={() => updateForm({ kp_mode: 'off', kps_enabled: false })}
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    form.kp_mode === 'off'
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border text-foreground hover:bg-muted'
                  }`}
                >
                  Off
                </button>
              </div>
              {/* "Part of Skins" is disabled when BOTH gross and net skins are on */}
              <div className="flex items-center justify-between">
                <Label className={`text-sm ${form.gross_skins_enabled && form.net_skins_enabled ? 'text-muted-foreground' : ''}`}>Part of Skins</Label>
                <button
                  type="button"
                  disabled={form.gross_skins_enabled && form.net_skins_enabled}
                  onClick={() => updateForm({ kp_mode: 'part_of_skins', kps_enabled: true, kp_separate_buy_in: false, kp_counts_as_skin: true })}
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    form.gross_skins_enabled && form.net_skins_enabled
                      ? 'border border-border text-muted-foreground cursor-not-allowed opacity-50'
                      : form.kp_mode === 'part_of_skins'
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border text-foreground hover:bg-muted'
                  }`}
                >
                    Part of Skins
                </button>
              </div>
              {/* If both skins are on and "Part of Skins" was selected, reset to off */}
              {form.gross_skins_enabled && form.net_skins_enabled && form.kp_mode === 'part_of_skins' && (
                (() => { setTimeout(() => updateForm({ kp_mode: 'off', kps_enabled: false }), 0); return null; })()
              )}
              <div className="flex items-center justify-between">
                <Label className="text-sm">Separate Buy-In</Label>
                <button
                  onClick={() => updateForm({ kp_mode: 'separate', kps_enabled: true, kp_separate_buy_in: true })}
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    form.kp_mode === 'separate'
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border text-foreground hover:bg-muted'
                  }`}
                >
                  Buy-In
                </button>
              </div>
              {form.gross_skins_enabled && form.net_skins_enabled && (
                <p className="text-xs text-muted-foreground italic">Both skins types enabled — KP must use a separate buy-in.</p>
              )}
            </>
          ) : isCustom ? (
            <>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Off</Label>
                <button
                  type="button"
                  onClick={() => updateForm({ kp_mode: 'off', kps_enabled: false })}
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    form.kp_mode === 'off'
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border text-foreground hover:bg-muted'
                  }`}
                >
                  Off
                </button>
              </div>
              {/* "Part of Skins" is disabled when BOTH gross and net skins are on, or for multi-day series */}
              <div className="flex items-center justify-between">
                <Label className={`text-sm ${(form.gross_skins_enabled && form.net_skins_enabled) || isMultiDay ? 'text-muted-foreground' : ''}`}>Part of Skins</Label>
                <button
                  type="button"
                  disabled={(form.gross_skins_enabled && form.net_skins_enabled) || isMultiDay}
                  onClick={() => updateForm({ kp_mode: 'part_of_skins', kps_enabled: true, kp_separate_buy_in: false, kp_counts_as_skin: true })}
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    (form.gross_skins_enabled && form.net_skins_enabled) || isMultiDay
                      ? 'border border-border text-muted-foreground cursor-not-allowed opacity-50'
                      : form.kp_mode === 'part_of_skins'
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border text-foreground hover:bg-muted'
                  }`}
                >
                    Part of Skins
                </button>
              </div>
              {form.gross_skins_enabled && form.net_skins_enabled && (
                <p className="text-xs text-muted-foreground italic pl-1">Both skins types enabled — KP must use a separate buy-in.</p>
              )}
              {isMultiDay && (
                <p className="text-xs text-muted-foreground italic pl-1">Multi-day series — KP must use a separate buy-in.</p>
              )}
              <div className="flex items-center justify-between">
                <Label className="text-sm">Separate Buy-In</Label>
                <button
                  type="button"
                  onClick={() => updateForm({ kp_mode: 'separate', kps_enabled: true, kp_separate_buy_in: true })}
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    form.kp_mode === 'separate'
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border text-foreground hover:bg-muted'
                  }`}
                >
                  Buy-In
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Off</Label>
                <button
                  type="button"
                  onClick={() => updateForm({ kp_mode: 'off', kps_enabled: false })}
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    form.kp_mode === 'off'
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border text-foreground hover:bg-muted'
                  }`}
                >
                  Off
                </button>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Separate Buy-In</Label>
                <button
                  type="button"
                  onClick={() => updateForm({ kp_mode: 'separate', kps_enabled: true, kp_separate_buy_in: true })}
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    form.kp_mode === 'separate'
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border text-foreground hover:bg-muted'
                  }`}
                >
                  Buy-In
                </button>
              </div>
            </>
          )}
          {!isOff && form.kp_separate_buy_in && form.kp_mode === 'separate' && (
            <div className="flex items-center justify-between pt-2 border-t">
              <Label className="text-sm">KP Buy-In ($)</Label>
              <BuyInInput value={form.kp_buy_in} onChange={v => updateForm({ kp_buy_in: v })} />
            </div>
          )}
        </div>
      </div>

      {/* Skins */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-foreground">Skins</p>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className={`text-sm ${form.kp_mode === 'part_of_skins' && form.net_skins_enabled && !form.gross_skins_enabled ? 'text-muted-foreground' : ''}`}>Gross Skins</Label>
            <Switch
              checked={form.gross_skins_enabled}
              disabled={form.kp_mode === 'part_of_skins' && form.net_skins_enabled && !form.gross_skins_enabled}
              onCheckedChange={v => {
                const bothOn = v && form.net_skins_enabled;
                if (bothOn && form.kp_mode === 'part_of_skins') {
                  updateForm({ gross_skins_enabled: v, kp_mode: 'off', kps_enabled: false, gross_skins_separate_buy_in: isMultiDay ? true : form.gross_skins_separate_buy_in });
                } else {
                  updateForm({ gross_skins_enabled: v, ...(isMultiDay && v ? { gross_skins_separate_buy_in: true } : {}) });
                }
              }}
            />
          </div>
          {form.kp_mode === 'part_of_skins' && form.net_skins_enabled && !form.gross_skins_enabled && (
            <p className="text-xs text-muted-foreground italic pl-1">Gross Skins unavailable — KP is Part of Net Skins.</p>
          )}

          {form.gross_skins_enabled && !isFixed && (
            <div className="flex items-center justify-between pl-4">
              <Label className="text-xs text-muted-foreground">Separate Buy-In</Label>
              <Switch
                checked={form.gross_skins_separate_buy_in}
                disabled={isMultiDay}
                onCheckedChange={v => updateForm({ gross_skins_separate_buy_in: v })}
              />
            </div>
          )}

          {form.gross_skins_enabled && !isFixed && form.gross_skins_separate_buy_in && (
            <div className="flex items-center justify-between pl-4">
              <Label className="text-xs text-muted-foreground">Buy-In ($)</Label>
              <BuyInInput value={form.gross_skins_buy_in} onChange={v => updateForm({ gross_skins_buy_in: v })} />
            </div>
          )}

          {form.gross_skins_enabled && isFixed && (
            <p className="text-xs text-muted-foreground pl-4 italic">Funded from the fixed side pot — no separate buy-in.</p>
          )}

          <div className="flex items-center justify-between">
            <Label className={`text-sm ${form.kp_mode === 'part_of_skins' && form.gross_skins_enabled && !form.net_skins_enabled ? 'text-muted-foreground' : ''}`}>Net Skins</Label>
            <Switch
              checked={form.net_skins_enabled}
              disabled={form.kp_mode === 'part_of_skins' && form.gross_skins_enabled && !form.net_skins_enabled}
              onCheckedChange={v => {
                const bothOn = v && form.gross_skins_enabled;
                if (bothOn && form.kp_mode === 'part_of_skins') {
                  updateForm({ net_skins_enabled: v, kp_mode: 'off', kps_enabled: false, net_skins_separate_buy_in: isMultiDay ? true : form.net_skins_separate_buy_in });
                } else {
                  updateForm({ net_skins_enabled: v, ...(isMultiDay && v ? { net_skins_separate_buy_in: true } : {}) });
                }
              }}
            />
          </div>
          {form.kp_mode === 'part_of_skins' && form.gross_skins_enabled && !form.net_skins_enabled && (
            <p className="text-xs text-muted-foreground italic pl-1">Net Skins unavailable — KP is Part of Gross Skins.</p>
          )}

          {form.net_skins_enabled && !isFixed && (
            <div className="flex items-center justify-between pl-4">
              <Label className="text-xs text-muted-foreground">Separate Buy-In</Label>
              <Switch
                checked={form.net_skins_separate_buy_in}
                disabled={isMultiDay}
                onCheckedChange={v => updateForm({ net_skins_separate_buy_in: v })}
              />
            </div>
          )}

          {form.net_skins_enabled && !isFixed && form.net_skins_separate_buy_in && (
            <div className="flex items-center justify-between pl-4">
              <Label className="text-xs text-muted-foreground">Buy-In ($)</Label>
              <BuyInInput value={form.net_skins_buy_in} onChange={v => updateForm({ net_skins_buy_in: v })} />
            </div>
          )}

          {form.net_skins_enabled && isFixed && (
            <p className="text-xs text-muted-foreground pl-4 italic">Funded from the fixed side pot — no separate buy-in.</p>
          )}

          {(form.gross_skins_enabled || form.net_skins_enabled) && (
            <div className="flex items-center justify-between pt-2 border-t">
              <Label className="text-sm">Skins Carryover/Wraparound</Label>
              <Switch
                checked={form.skins_carryover}
                onCheckedChange={v => updateForm({ skins_carryover: v })}
              />
            </div>
          )}

        </div>
      </div>

      {/* Deuce Pot */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-foreground">Deuce Pot</p>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Enable Deuce Pot</Label>
            <Switch
              checked={form.deuce_pot_enabled}
              onCheckedChange={v => updateForm({ deuce_pot_enabled: v })}
            />
          </div>

          {form.deuce_pot_enabled && (
            <div className="flex items-center justify-between pt-2 border-t">
              <Label className="text-sm">Deuce Buy-In ($)</Label>
              <BuyInInput value={form.deuce_buy_in} onChange={v => updateForm({ deuce_buy_in: v })} />
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 pt-4">
        <button type="button" onClick={prevStep} className="flex-1 py-2 px-4 rounded-md border-2 border-border bg-card text-foreground font-medium text-sm">
          Back
        </button>
        <Button
          onClick={handleFinish}
          disabled={loading}
          className="flex-1"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Creating...
            </>
          ) : (
            'Start Round'
          )}
        </Button>
      </div>
    </div>

    {showScrollHint && (
      <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center py-1 pointer-events-none">
        <ChevronDown className="w-4 h-4 text-muted-foreground animate-bounce" />
        <span className="text-xs text-muted-foreground">Scroll for more</span>
      </div>
    )}
    </div>
  );
}