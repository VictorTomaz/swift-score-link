import React, { useEffect, useState } from "react";

const SLOW_AFTER_MS = 12000;

// Full-screen spinner that never leaves the user stuck: if loading takes longer
// than SLOW_AFTER_MS it explains what is happening and offers a retry.
export default function LoadingScreen() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin"></div>
      {slow && (
        <>
          <p className="text-sm text-muted-foreground max-w-xs">
            This is taking longer than expected. Please check your connection.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
          >
            Try again
          </button>
        </>
      )}
    </div>
  );
}
