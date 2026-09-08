import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";

const PAGE_LABELS = {
  "/Dashboard": "Dashboard",
  "/SetupWizard": "Setup Wizard (New Round)",
  "/Scorecard": "Scorecard (roster & score entry)",
  "/Results": "Results & Payouts",
  "/History": "History",
  "/PlayersManagement": "Master Roster (Players)",
  "/CoursesManagement": "Courses",
  "/TournamentLogistics": "Tournament Logistics (tee times, scorecards, teams)",
  "/Help": "Help / Setup Guide",
  "/Faq": "FAQ",
  "/Settings": "Settings",
  "/TournamentResults": "Tournament Results",
};

function pageContextMarker(pathname) {
  const label = PAGE_LABELS[pathname] || (pathname.startsWith("/public-results/") ? "Public Results" : pathname);
  return `[ctx:${pathname}|${label}]`;
}
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Sparkles, Loader2 } from "lucide-react";
import HelpMessageBubble from "@/components/help-assistant/HelpMessageBubble";
import useHelpAutoNavigate from "@/hooks/useHelpAutoNavigate";


const SUGGESTIONS = [
  "How do I set up a new round?",
  "Where do I assign tee times?",
  "How do skins work?",
];

export default function HelpChatPanel({ open, onOpenChange }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!conversation?.id) return;
    const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
      if (data?.messages) setMessages(data.messages);
    });
    return () => unsubscribe();
  }, [conversation?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text) => {
    const question = (text ?? input).trim();
    if (!question || sending) return;
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    try {
      let conv = conversation;
      if (!conv) {
        conv = await base44.agents.createConversation({
          agent_name: "help_assistant",
          metadata: { name: "Help chat", description: "In-app help assistant" },
        });
        setConversation(conv);
      }
      const ctx = pageContextMarker(location.pathname);
      await base44.agents.addMessage(conv, { role: "user", content: `${ctx}\n${question}` });
    } finally {
      setSending(false);
    }
  };

  const handleNavigate = useCallback((path) => {
    onOpenChange(false);
    navigate(path);
  }, [navigate, onOpenChange]);

  // Auto-navigate only when the user explicitly asked to be taken somewhere.
  useHelpAutoNavigate(messages, handleNavigate);

  const lastMessage = messages[messages.length - 1];
  const waiting = sending || (lastMessage?.role === "user");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85dvh] flex flex-col p-0 rounded-t-2xl">
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border text-left space-y-1">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-primary" />
            Helper
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Ask how to set up rounds, enter scores, run side games, or find anything — I'll jump you to the right screen. I can also send you straight to a specific page.
          </p>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <HelpMessageBubble
            message={{
              role: "assistant",
              content: "Hi! 👋 I'm the Swift Score Helper. Ask me anything about setting up rounds, entering scores, side games, or where to find things in the app. I can also send you straight to a specific page.",
            }}
            onNavigate={handleNavigate}
          />
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="px-3 py-2 rounded-full border border-primary/30 bg-primary/5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {messages.map((msg, i) => (
            <HelpMessageBubble key={i} message={msg} onNavigate={handleNavigate} />
          ))}
          {waiting && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md bg-card border border-border px-4 py-3 shadow-sm">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 pt-3" data-safe-area>
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); send(); }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a how-to question…"
              className="flex-1 h-11"
            />
            <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={!input.trim() || sending}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}