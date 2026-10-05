import React from "react";

const RELOAD_KEY = "lazy-chunk-reload-attempted";

// Catches render/lazy-load failures so a screen that cannot load shows a
// recoverable message instead of a blank page.
export default class ChunkErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error("Screen failed to load:", error);
  }

  handleRetry = () => {
    try { window.sessionStorage.removeItem(RELOAD_KEY); } catch { /* storage may be unavailable */ }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-base font-semibold text-foreground">This screen could not be loaded.</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Please check your connection and try again.
        </p>
        <button
          type="button"
          onClick={this.handleRetry}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Try again
        </button>
      </div>
    );
  }
}
