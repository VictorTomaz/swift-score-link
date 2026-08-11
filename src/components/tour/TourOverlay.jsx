import React, { useEffect, useState } from 'react';
import { useTour } from '@/context/TourContext';
import { X } from 'lucide-react';

const TOUR_STEPS = [
  {
    id: 'dashboard-intro',
    title: 'Welcome to Swift Score! 🏌️',
    description: 'This is your Dashboard. View all your rounds, completed games, and quick stats. Start here for every new round.',
    target: '.tour-dashboard',
    position: 'bottom',
  },
  {
    id: 'event-details',
    title: 'Step 1: Event Details',
    description: 'Fill in your event name, course, date, and tee set. Load a saved course to auto-fill course info, or enter details manually.',
    target: '.tour-event-details',
    position: 'bottom',
  },
  {
    id: 'game-mode',
    title: 'Step 2: Choose Game Mode',
    description: 'Fixed Payouts: Standard $11 formula (scales with any buy-in). Custom: You control payout splits. Off: Just track scores.',
    target: '.tour-game-mode',
    position: 'bottom',
  },
  {
    id: 'buy-in',
    title: 'Step 3: Set Buy-In Amount',
    description: 'This is what each player pays into the main pot. Total pot = Buy-In × Player Count. Required for Fixed and Custom modes.',
    target: '.tour-buy-in',
    position: 'bottom',
  },
  {
    id: 'player-count',
    title: 'Step 4: Player Count',
    description: 'How many players in this round? This affects the total pot size and payout calculations.',
    target: '.tour-player-count',
    position: 'bottom',
  },
  {
    id: 'side-games',
    title: 'Step 5: Add Side Games (Optional)',
    description: 'Add KPs (closest to pin), skins (hole winners), deuce pot, or other games. Each has its own separate buy-in.',
    target: '.tour-side-games',
    position: 'top',
  },
  {
    id: 'continue-btn',
    title: 'Step 6: Continue to Roster',
    description: 'Click to move to the next step where you\'ll add players, set handicaps, and set up the course details.',
    target: '.tour-continue-btn',
    position: 'top',
  },
  {
    id: 'scorecard-course',
    title: 'Step 7: Course Setup',
    description: 'Set up the course details here. Par and handicap indexes will be used to calculate scores.',
    target: '.tour-scorecard-course',
    position: 'bottom',
  },
  {
    id: 'scorecard-roster',
    title: 'Step 8: Add Players & Handicaps',
    description: 'Add your players and set their handicaps. These details are essential for score calculations.',
    target: '.tour-scorecard-roster',
    position: 'bottom',
  },
  {
    id: 'scoring-modes',
    title: 'Step 9: Choose Scoring Method',
    description: 'Select your preferred scoring method: Tap (quick), Type (manual), or Dictate (voice).',
    target: '.tour-scoring-modes',
    position: 'bottom',
  },
  {
    id: 'tap-scoring',
    title: 'Step 10: Enter Scores',
    description: 'Enter scores for each player. Use your preferred input method to record the holes.',
    target: '.tour-tap-scoring',
    position: 'bottom',
  },
  {
    id: 'compute-results',
    title: 'Step 11: Compute Results',
    description: 'Once all scores are entered, click here to calculate payouts and see the final results.',
    target: '.tour-compute-results',
    position: 'top',
  },
  {
    id: 'results-page',
    title: 'Results Summary',
    description: 'Your round results are displayed here. View payouts, standings, and all side game outcomes.',
    target: '.tour-results-summary',
    position: 'bottom',
  },
  {
    id: 'history-page',
    title: 'Round History',
    description: 'View all your past rounds here. You can click on any round to see results or edit it.',
    target: '.tour-history-list',
    position: 'bottom',
  },
  {
    id: 'courses-page',
    title: 'Manage Courses',
    description: 'Add and save golf courses here for quick reference in future rounds.',
    target: '.tour-courses-list',
    position: 'bottom',
  },
  {
    id: 'players-page',
    title: 'Manage Players',
    description: 'Create and manage your player database. Set handicaps and update player info here.',
    target: '.tour-players-list',
    position: 'bottom',
  },
  {
    id: 'help-page',
    title: 'Help & Setup Guide',
    description: 'Need help? Check out the detailed guide here with payout charts and game rules.',
    target: '.tour-help-content',
    position: 'bottom',
  },
];

export default function TourOverlay() {
  const { isActive, currentStep, skipTour, nextStep, prevStep, endTour } = useTour();
  const [displayStep, setDisplayStep] = useState(currentStep);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

  // Update display step when currentStep changes
  useEffect(() => {
    if (!isActive) return;
    
    setDisplayStep(currentStep);
    
    // Try to scroll to target if it exists
    const target = document.querySelector(TOUR_STEPS[currentStep]?.target);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isActive, currentStep]);

  // Keep tooltip in fixed center position
  useEffect(() => {
    if (!isActive) return;
    setTooltipPos({ top: 50, left: window.innerWidth / 2 - 160 });
  }, [isActive]);

  if (!isActive) return null;

  const step = TOUR_STEPS[displayStep];
  if (!step) {
    endTour();
    return null;
  }

  const target = document.querySelector(step.target);
  const isLastStep = displayStep === TOUR_STEPS.length - 1;

  return (
    <>
      {/* Dark overlay */}
      <div className="fixed inset-0 bg-black/40 z-30 pointer-events-none" />

      {/* Tooltip */}
      <div className="fixed z-40 pointer-events-auto" style={{ top: `${tooltipPos.top}px`, left: `${tooltipPos.left}px`, width: '320px' }}>
        <div
          className="bg-yellow-400 text-black p-4 rounded-lg shadow-2xl w-80"
          style={{ position: 'relative' }}
        >
          <button
            onClick={skipTour}
            className="absolute top-2 right-2 text-black hover:opacity-70 transition-opacity"
          >
            <X className="w-5 h-5" />
          </button>

          <h3 className="text-sm font-semibold mb-2 pr-6">{step.title}</h3>
          <p className="text-xs leading-relaxed mb-3">{step.description}</p>

          {/* Progress indicator */}
          <div className="flex gap-1 mb-3">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className="h-1 flex-1 rounded-full"
                style={{
                  backgroundColor: i <= displayStep ? '#1a5f3f' : '#ccc',
                }}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex gap-2">
            <button
              onClick={prevStep}
              disabled={displayStep === 0}
              className="flex-1 px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Back
            </button>
            {isLastStep ? (
              <button
                onClick={endTour}
                className="flex-1 px-2 py-1 text-xs bg-green-700 text-white rounded hover:bg-green-800"
              >
                Done
              </button>
            ) : (
              <>
                <button
                  onClick={skipTour}
                  className="flex-1 px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-100"
                >
                  Skip
                </button>
                <button
                  onClick={nextStep}
                  className="flex-1 px-2 py-1 text-xs bg-green-700 text-white rounded hover:bg-green-800"
                >
                  Next →
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Highlight box - only render if target exists */}
      {target && <TargetHighlight target={step.target} />}
    </>
  );
}

function TargetHighlight({ target }) {
  const [rect, setRect] = useState(null);

  useEffect(() => {
    const element = document.querySelector(target);
    if (element) {
      const r = element.getBoundingClientRect();
      setRect({
        top: r.top + window.scrollY,
        left: r.left,
        width: r.width,
        height: r.height,
      });
    }
  }, [target]);

  if (!rect) return null;

  return (
    <div
      className="fixed pointer-events-none z-35"
      style={{
        top: rect.top - 4,
        left: rect.left - 4,
        width: rect.width + 8,
        height: rect.height + 8,
        border: '3px solid #1a5f3f',
        borderRadius: '12px',
        boxShadow: '0 0 0 2px #1a5f3f, 0 0 20px rgba(26, 95, 63, 0.3)',
        animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }}
    />
  );
}