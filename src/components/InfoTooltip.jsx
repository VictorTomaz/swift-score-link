import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";

const BOLD_TERMS = ["Fixed Payouts:", "Custom Payouts:", "Off:", "Part of Skins:", "Separate Buy-In:", "Off =", "Part of Skins =", "Separate Buy-In ="];

export default function InfoTooltip({ text }) {
  const parts = text.split(/(Fixed Payouts:|Custom Payouts:|Off:|Part of Skins:|Separate Buy-In:|Off =|Part of Skins =|Separate Buy-In =)/);
  const content = parts.map((part, i) =>
    BOLD_TERMS.includes(part) ? <strong key={i}>{part}</strong> : part
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span className="inline-flex items-center cursor-pointer text-muted-foreground hover:text-foreground transition-colors ml-1">
          <Info className="w-3.5 h-3.5" />
        </span>
      </PopoverTrigger>
      <PopoverContent className="max-w-xs text-sm leading-snug" side="top">
        {content}
      </PopoverContent>
    </Popover>
  );
}