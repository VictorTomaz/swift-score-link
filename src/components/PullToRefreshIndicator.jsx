import { Loader2 } from "lucide-react";

export default function PullToRefreshIndicator({ isRefreshing, pullDistance, threshold = 80 }) {
  const progress = Math.min(pullDistance / threshold, 1);
  const visible = pullDistance > 8 || isRefreshing;

  if (!visible) return null;

  return (
    <div
      className="flex items-center justify-center transition-all duration-150"
      style={{ height: isRefreshing ? 44 : Math.min(pullDistance * 0.5, 44), overflow: 'hidden' }}
    >
      <div className={`w-8 h-8 rounded-full bg-card border border-border shadow flex items-center justify-center transition-transform`}
           style={{ transform: `scale(${0.6 + progress * 0.4})`, opacity: 0.5 + progress * 0.5 }}>
        <Loader2 className={`w-4 h-4 text-primary ${isRefreshing ? 'animate-spin' : ''}`}
                 style={{ transform: isRefreshing ? undefined : `rotate(${progress * 270}deg)` }} />
      </div>
    </div>
  );
}