import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { X, ChevronLeft } from 'lucide-react';

import GamesConfiguration from '@/components/setup-wizard/GamesConfiguration';
import Step1GameMode from '@/components/setup-wizard/Step1GameMode';
import Step2Course from '@/components/setup-wizard/Step2Course';
import Step3CompetitionName from '@/components/setup-wizard/Step3CompetitionName';
import Step4Date from '@/components/setup-wizard/Step4Date';
import Step5BuyIn from '@/components/setup-wizard/Step5BuyIn';
import Step6PlayerCount from '@/components/setup-wizard/Step6PlayerCount';
import Step7ModeSpecificSetup from '@/components/setup-wizard/Step7ModeSpecificSetup';
import PageDescription from '@/components/PageDescription';

const STEPS = [
  { id: 1, title: 'Games' },
  { id: 2, title: 'Game Mode' },
  { id: 3, title: 'Course' },
  { id: 4, title: 'Competition Name' },
  { id: 5, title: 'Date' },
  { id: 6, title: 'Buy-In' },
  { id: 7, title: 'Player Count' },
  { id: 8, title: 'Side Games' },
];

const SESSION_KEY = 'setupWizard_draft';

const defaultForm = {
  game_mode: null,
  course_id: null,
  course_name: '',
  tee_set: '',
  slope: null,
  rating: null,
  par: [],
  hole_handicap_indexes: [],
  course_tee_sets: [],
  event_name: '',
  date: new Date().toISOString().split('T')[0],
  buy_in: null,
  player_count: null,
  kps_enabled: false,
  kp_mode: 'off',
  kp_separate_buy_in: false,
  kp_buy_in: 5,
  kp_counts_as_skin: true,
  gross_skins_enabled: false,
  gross_skins_separate_buy_in: false,
  gross_skins_buy_in: 5,
  net_skins_enabled: false,
  net_skins_separate_buy_in: false,
  net_skins_buy_in: 5,
  skins_carryover: false,
  deuce_pot_enabled: false,
  deuce_buy_in: 5,
  custom_place_payout_percent: 60,
  custom_games_percent: 40,
  custom_gross_percent: 50,
  custom_net_percent: 50,
  custom_gross_field_percent: 35,
  custom_net_field_percent: 35,
  custom_gross_places: 2,
  custom_net_places: 2,
  game_type: null,
  team_mode: false,
  team_size: 2,
  team_format: 'best_ball',
  hcp_formula: 'combined_85',
  games: [],
  is_multi_day: false,
  parent_round_id: null,
  series_type: 'multi_day',
};

export default function SetupWizard() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const existingRoundId = urlParams.get('id');
  const addFlightParentId = urlParams.get('addFlight');
  const addDayRoundId = urlParams.get('addDay');
  const [loading, setLoading] = useState(false);
  const [formReady, setFormReady] = useState(!existingRoundId && !addFlightParentId && !addDayRoundId);

  // Every "New Round" starts fresh — no draft restoration.
  // Drafts were causing stale data (old buy-in, pot splits, flight settings)
  // to bleed into new rounds when users navigated away without completing.
  useEffect(() => {
    // Clear any leftover draft from a previous version
    sessionStorage.removeItem(SESSION_KEY);
  }, []);

  const [currentStep, setCurrentStep] = useState(1);
  const [form, setForm] = useState(defaultForm);



  // If editing an existing round, load its settings into the form
  const { data: existingRound } = useQuery({
    queryKey: ['round', existingRoundId],
    queryFn: async () => {
      const rounds = await base44.entities.Round.filter({ id: existingRoundId });
      return rounds[0];
    },
    enabled: !!existingRoundId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (existingRound && !formReady) {
      const kp_mode = !existingRound.kps_enabled ? 'off'
        : existingRound.kp_separate_buy_in ? 'separate'
        : 'part_of_skins';
      setForm(f => ({ ...f, ...existingRound, kp_mode }));
      setFormReady(true);
      setCurrentStep(1); // Start at the first step when editing an existing round
    }
  }, [existingRound, formReady]);

  // Add Flight mode: load the parent round and pre-fill the form to create a
  // new child flight linked to that parent. The user reviews each step and
  // saves to create the new flight round.
  const { data: parentRound } = useQuery({
    queryKey: ['round', addFlightParentId],
    queryFn: async () => {
      const rounds = await base44.entities.Round.filter({ id: addFlightParentId });
      return rounds[0];
    },
    enabled: !!addFlightParentId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Add Day mode: load the source flight round to create a new day for the
  // SAME flight (same flight_number, buy_in=0 since entry fee was on Day 1).
  const { data: addDaySourceRound } = useQuery({
    queryKey: ['round', addDayRoundId],
    queryFn: async () => {
      const rounds = await base44.entities.Round.filter({ id: addDayRoundId });
      return rounds[0];
    },
    enabled: !!addDayRoundId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (parentRound && !formReady) {
      const isHybrid = !!(parentRound.is_multi_day && parentRound.is_multi_flight);
      const kp_mode = !parentRound.kps_enabled ? 'off'
        : parentRound.kp_separate_buy_in ? 'separate'
        : 'part_of_skins';
      // Always fetch children to determine the next flight number — not just
      // for hybrid. Without this, non-hybrid multi-flight children all get
      // flight_number=1 (the entity default), making them indistinguishable.
      base44.entities.Round.filter({ parent_round_id: parentRound.id }, '-created_date', 200)
        .then(children => {
          const allRounds = [parentRound, ...(children || [])];
          const maxFn = Math.max(...allRounds.map(r => r.flight_number || 1), 0);
          setForm(f => ({ ...f, flight_number: maxFn + 1 }));
        })
        .catch(() => {});
      setForm(f => ({
        ...f,
        ...parentRound,
        kp_mode,
        // Override: this is a NEW child flight, not the parent itself
        id: undefined,
        parent_round_id: parentRound.id,
        // Inherit is_multi_day directly — don't force it on. A multi-flight-only
        // tournament (is_multi_day=false) must stay that way on children, otherwise
        // isHybrid (is_multi_day && is_multi_flight) would be true on the child
        // but false on the parent, corrupting payout logic.
        is_multi_day: parentRound.is_multi_day,
        is_multi_flight: true,
        series_type: 'multi_flight',
        is_series_final: false,
        // flight_number is set async above (maxFn + 1) — starts at 2 for the
        // first child (parent is always flight 1).
        flight_number: 2,
        players: [],
        kp_winners: [],
        status: 'roster',
        results: null,
        results_pdf_url: null,
        scorecard_pdf_url: null,
        locked_format: null,
        // Keep buy_in from parent — each flight collects its own entry fee
        buy_in: parentRound.buy_in ?? 0,
        player_count: isHybrid ? null : (parentRound.player_count ?? null),
      }));
      setFormReady(true);
      setCurrentStep(1);
    }
  }, [parentRound, formReady]);

  // Add Day mode: create a new day for an existing flight. Inherits all
  // settings from the source round (course, side games, format) but keeps
  // the SAME flight_number and sets buy_in=0 (entry fee collected on Day 1).
  useEffect(() => {
    if (addDaySourceRound && !formReady) {
      const kp_mode = !addDaySourceRound.kps_enabled ? 'off'
        : addDaySourceRound.kp_separate_buy_in ? 'separate'
        : 'part_of_skins';
      // Auto-advance the date by 1 day from the source round's date —
      // Day 2 is typically the next day. The user can still edit it on
      // the Date step if the tournament plays on a different schedule.
      const nextDate = new Date(addDaySourceRound.date);
      nextDate.setDate(nextDate.getDate() + 1);
      const nextDayStr = nextDate.toISOString().split('T')[0];
      setForm(f => ({
        ...f,
        ...addDaySourceRound,
        kp_mode,
        id: undefined,
        // Link to the same tournament anchor as the source round
        parent_round_id: addDaySourceRound.parent_round_id || addDaySourceRound.id,
        // Keep the SAME flight number — this is day 2 of the same flight
        flight_number: addDaySourceRound.flight_number || 1,
        // Buy-in is 0 — entry fee was collected on Day 1
        buy_in: 0,
        is_series_final: false,
        date: nextDayStr,
        players: [],
        kp_winners: [],
        status: 'roster',
        results: null,
        results_pdf_url: null,
        scorecard_pdf_url: null,
        locked_format: null,
        // Inherit the source round's player_count so the locked Player Count
        // step displays the actual team/player number instead of "—".
        // The roster carries over across days in a multi-day series.
        player_count: addDaySourceRound.player_count ?? null,
      }));
      setFormReady(true);
      setCurrentStep(1);
    }
  }, [addDaySourceRound, formReady]);

  const visibleSteps = STEPS;
  const visibleStepIndex = visibleSteps.findIndex(s => s.id === currentStep);
  const stepNumber = visibleStepIndex >= 0 ? visibleStepIndex + 1 : 1;
  const stepCount = visibleSteps.length;

  const nextStep = () => {
    if (currentStep < STEPS.length) setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else if (existingRoundId) {
      navigate(`/Scorecard?id=${existingRoundId}`);
    } else {
      navigate('/Dashboard');
    }
  };

  const handleCreate = async () => {
    setLoading(true);
    // Strip UI-only fields that don't belong on the Round entity
    const { kp_mode, course_id, ...formFields } = form;
    const formToSave = {
      ...formFields,
      buy_in: Number(form.buy_in),
      player_count: Number(form.player_count),
      custom_gross_places: form.custom_gross_places ? Number(form.custom_gross_places) : 0,
      custom_net_places: form.custom_net_places ? Number(form.custom_net_places) : 0,
    };

    // For Add Flight / Add Day: strip built-in and inherited runtime fields
    // so the create call produces a clean child round, not a clone.
    if (addFlightParentId || addDayRoundId) {
      const { id, created_date, updated_date, created_by, created_by_id,
        results, results_pdf_url, scorecard_pdf_url, locked_format,
        tee_sheet_config, is_public, kp_holes, kp_player_ids,
        gross_skins_player_ids, net_skins_player_ids, deuce_player_ids,
        ...flightFields } = formToSave;
      const round = await base44.entities.Round.create({
        ...flightFields,
        status: 'roster',
        players: [],
        kp_winners: [],
        kp_holes: [],
        kp_player_ids: [],
        gross_skins_player_ids: [],
        net_skins_player_ids: [],
        deuce_player_ids: [],
      });
      sessionStorage.removeItem(SESSION_KEY);
      setLoading(false);
      navigate(`/Scorecard?id=${round.id}`);
      return;
    }

    if (existingRoundId) {
      // When editing, only send config fields the wizard manages — NOT players, status,
      // results, kp_winners, or built-in fields (id, created_date, etc.) which are stale
      // snapshots from when the wizard opened and would overwrite current DB data.
      const { players, status, results, kp_winners, kp_holes, kp_player_ids,
        gross_skins_player_ids, net_skins_player_ids, deuce_player_ids,
        id, created_date, updated_date, created_by, created_by_id,
        scorecard_pdf_url, locked_format, tee_sheet_config, is_public,
        ...configFields } = formToSave;
      await base44.entities.Round.update(existingRoundId, configFields);
      setLoading(false);
      // Return to Results for finished rounds (where setup changes matter most),
      // otherwise back to the Scorecard roster/scoring flow.
      navigate(existingRound?.status === 'completed'
        ? `/Results?id=${existingRoundId}`
        : `/Scorecard?id=${existingRoundId}`);
    } else {
      const round = await base44.entities.Round.create({
        ...formToSave,
        status: 'roster',
        players: [],
        kp_winners: [],
      });
      sessionStorage.removeItem(SESSION_KEY);
      setLoading(false);
      navigate(`/Scorecard?id=${round.id}`);
    }
  };

  const updateForm = (updates) => {
    setForm(f => ({ ...f, ...updates }));
  };

  const renderStep = () => {
    const props = { form, updateForm, nextStep, prevStep, currentStep, STEPS, isAddDay: !!addDayRoundId };

    switch (currentStep) {
      case 1:
        return <GamesConfiguration {...props} />;
      case 2:
        return <Step1GameMode {...props} />;
      case 3:
        return <Step2Course {...props} />;
      case 4:
        return <Step3CompetitionName {...props} />;
      case 5:
        return <Step4Date {...props} />;
      case 6:
        return <Step5BuyIn {...props} />;
      case 7:
        return <Step6PlayerCount {...props} />;
      case 8:
        return <Step7ModeSpecificSetup {...props} onComplete={handleCreate} loading={loading} />;
      default:
        return null;
    }
  };

  // When editing an existing round, don't render the wizard (or allow a save) until the
  // round's saved config has loaded into the form. Otherwise the wizard briefly shows the
  // default (individual) setup, and a quick save would overwrite the team config with defaults.
  if ((existingRoundId || addFlightParentId || addDayRoundId) && !formReady) {
    return (
      <div className="min-h-screen w-full max-w-md mx-auto flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">{addFlightParentId ? 'Loading flight setup…' : 'Loading round setup…'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full max-w-md mx-auto pb-32 pt-4 px-4" style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div className="bg-card rounded-lg shadow-2xl w-full relative border border-border">
        <div className="px-6 pt-5 pr-14">
          <PageDescription
            title={addDayRoundId ? `Add a Day to Flight ${form.flight_number || 1}` : addFlightParentId ? `Add Flight ${form.flight_number || 2}` : "New Round Setup"}
            description={addDayRoundId
              ? `Settings are inherited from Day 1 of Flight ${form.flight_number || 1}. Buy-in is $0 — the entry fee was collected on Day 1. Enter a new date and roster to start scoring the next day.`
              : addFlightParentId
                ? "Settings are inherited from the parent tournament. Review each step, then save to create this new flight with its own roster."
                : "Follow the steps below to configure your golf round. Set up individual or team games, choose a course, name your event, set your buy-in (if any), and configure side games like KPs, Skins, and Deuce Pots."}
          />
          {existingRound?.status === 'completed' && (
            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <ChevronLeft className="w-4 h-4" /> Save & Back to Results
                </>
              )}
            </button>
          )}
        </div>
        <button
          onClick={() => navigate('/Dashboard')}
          className="absolute top-4 right-4 p-2 rounded-full bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>
        {/* Step progress */}
        <div className="px-6 pt-3 pb-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">Step {stepNumber} of {stepCount}</span>
            <span className="text-xs font-semibold text-foreground">{STEPS[currentStep - 1].title}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div
              className="bg-primary h-1.5 rounded-full transition-all"
              style={{ width: `${(stepNumber / stepCount) * 100}%` }}
            />
          </div>
        </div>
        {renderStep()}
      </div>
    </div>
  );
}