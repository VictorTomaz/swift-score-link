import { useEffect, useRef } from "react";
import { parseGotoActions } from "@/lib/helpNavigation";

const SETTLE_MS = 1400;

const NAVIGATION_INTENT = /\b(take me to|go to|send me to|bring me to|jump to|navigate to|open (the|my))\b/i;

/**
 * Auto-navigates ONLY when the user explicitly asked to be taken somewhere
 * (e.g. "take me to the scorecard") AND the assistant's reply resolves to
 * exactly one destination. For plain questions, the answer is shown and the
 * navigation button stays for the user to tap manually.
 */
export default function useHelpAutoNavigate(messages, onNavigate) {
  const handledRef = useRef(-1);

  useEffect(() => {
    const index = messages.length - 1;
    const last = messages[index];
    if (!last || last.role === "user" || index <= handledRef.current) return;

    // Find the most recent user message to check for navigation intent.
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser || !NAVIGATION_INTENT.test(lastUser.content)) return;

    const actions = parseGotoActions(last.content);
    if (actions.length !== 1) return;

    const timer = setTimeout(() => {
      handledRef.current = index;
      onNavigate(actions[0].path);
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [messages, onNavigate]);
}