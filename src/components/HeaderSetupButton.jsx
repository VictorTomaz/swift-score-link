import { useNavigate, useLocation } from 'react-router-dom';
import { PlusCircle, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

const DRAFT_KEY = 'setupWizard_draft';
const ACTIVE_ROUND_KEY = 'lastRoundId';

// Inline header button (mobile + desktop).
// - When an active round is known (Scorecard/Results/etc.), opens the wizard in
//   EDIT mode for that round — preserving its data.
// - Otherwise starts a fresh wizard at Step 1 (clears any saved draft).
export default function HeaderSetupButton({ className }) {
  const navigate = useNavigate();
  const location = useLocation();

  if (['/Paywall', '/TermsAndPrivacy'].includes(location.pathname)) return null;

  // Prefer the round id from the URL when on a round page — that's always the round
  // the user is currently viewing. Fall back to sessionStorage for non-round pages.
  let urlRoundId = null;
  try { urlRoundId = new URLSearchParams(location.search).get('id'); } catch {}

  let activeRoundId = null;
  try { activeRoundId = sessionStorage.getItem(ACTIVE_ROUND_KEY); } catch {}

  const onRoundPage = ['/Scorecard', '/Results', '/TournamentLogistics'].includes(location.pathname);
  const roundId = (onRoundPage && urlRoundId) ? urlRoundId : activeRoundId;
  const editing = roundId && onRoundPage;

  const handleClick = () => {
    if (editing) {
      navigate(`/SetupWizard?id=${roundId}`);
      return;
    }
    try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
    navigate('/SetupWizard');
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-3 h-9 text-sm font-semibold transition-colors min-h-[44px]',
        editing
          ? 'bg-edit text-edit-foreground hover:bg-edit/90'
          : 'bg-primary text-primary-foreground hover:bg-primary/90',
        className
      )}
      aria-label={editing ? 'Edit round setup' : 'Edit Round'}
    >
      {editing
        ? <SlidersHorizontal className="w-4 h-4" />
        : <PlusCircle className="w-4 h-4" />}
      <span>{editing ? 'Edit Setup' : 'Edit Round'}</span>
    </button>
  );
}