import { useTour } from '@/context/TourContext';
import { Button } from '@/components/ui/button';
import { HelpCircle, X } from 'lucide-react';

export default function TourButton() {
  const { isActive, startTour, endTour } = useTour();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={isActive ? endTour : startTour}
      className="gap-2 h-9 px-3"
      title={isActive ? "Close tour" : "Start guided tour"}
    >
      {isActive ? <X className="w-4 h-4" /> : <HelpCircle className="w-4 h-4" />}
    </Button>
  );
}