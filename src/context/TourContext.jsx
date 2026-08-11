import React, { createContext, useState, useEffect } from 'react';

export const TourContext = createContext();

const TOUR_COMPLETED_KEY = 'swift_score_tour_completed';

const TOUR_STEPS = [
  { id: 'dashboard-intro', target: '.tour-dashboard' },
  { id: 'event-details', target: '.tour-event-details' },
  { id: 'game-mode', target: '.tour-game-mode' },
  { id: 'buy-in', target: '.tour-buy-in' },
  { id: 'player-count', target: '.tour-player-count' },
  { id: 'side-games', target: '.tour-side-games' },
  { id: 'continue-btn', target: '.tour-continue-btn' },
  { id: 'scorecard-course', target: '.tour-scorecard-course' },
  { id: 'scorecard-roster', target: '.tour-scorecard-roster' },
  { id: 'scorecard-start', target: '.tour-scorecard-start' },
  { id: 'scoring-modes', target: '.tour-scoring-modes' },
  { id: 'tap-scoring', target: '.tour-tap-scoring' },
  { id: 'kp-entry', target: '.tour-kp-entry' },
  { id: 'compute-results', target: '.tour-compute-results' },
  { id: 'results-payouts', target: '.tour-results-payouts' },
  { id: 'tour-complete', target: '.tour-dashboard' },
];

export function TourProvider({ children }) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasCompletedTour, setHasCompletedTour] = useState(false);

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_COMPLETED_KEY) === 'true';
    setHasCompletedTour(completed);
  }, []);

  const startTour = () => {
    console.log('✅ startTour called - setting isActive=true');
    setIsActive(true);
    // Start from first available step (may skip steps with missing targets)
    // This is set to 0; TourOverlay will auto-advance if target not found
    setCurrentStep(0);
  };

  const nextStep = () => {
    setCurrentStep(prev => {
      let nextIdx = prev + 1;
      // Skip to next step that has a valid target on the page
      while (nextIdx < TOUR_STEPS.length) {
        const targetExists = document.querySelector(TOUR_STEPS[nextIdx]?.target);
        if (targetExists) break;
        nextIdx++;
      }
      return Math.min(nextIdx, TOUR_STEPS.length - 1);
    });
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(0, prev - 1));
  };

  const endTour = () => {
    setIsActive(false);
    localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
    setHasCompletedTour(true);
  };

  const skipTour = () => {
    endTour();
  };

  return (
    <TourContext.Provider value={{
      isActive,
      currentStep,
      hasCompletedTour,
      startTour,
      nextStep,
      prevStep,
      endTour,
      skipTour,
      setCurrentStep,
    }}>
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const context = React.useContext(TourContext);
  if (!context) {
    throw new Error('useTour must be used within TourProvider');
  }
  return context;
}