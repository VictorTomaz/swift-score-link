import React from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { parseGotoActions, stripGotoMarkers } from "@/lib/helpNavigation";

export default function HelpMessageBubble({ message, onNavigate }) {
  const isUser = message.role === "user";

  if (isUser) {
    const display = (message.content || "").replace(/^\[ctx:[^\]]*\]\s*/, "");
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-4 py-2.5 text-sm">
          {display}
        </div>
      </div>
    );
  }

  const raw = message.content || "";
  const actions = parseGotoActions(raw);
  const content = stripGotoMarkers(raw);

  if (!content && actions.length === 0) return null;

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-card border border-border px-4 py-3 shadow-sm space-y-2">
        {content && (
          <div className="text-sm text-foreground prose prose-sm max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
        {actions.map((a, i) => (
          <Button key={i} size="sm" className="gap-1.5" onClick={() => onNavigate(a.path)}>
            {a.label}
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        ))}
      </div>
    </div>
  );
}