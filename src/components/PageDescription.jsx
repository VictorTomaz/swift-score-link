import React from "react";
import { Info } from "lucide-react";

export default function PageDescription({ title, description }) {
  return (
    <div className="mb-4">
      {title && <h1 className="text-xl font-bold tracking-tight text-foreground">
        {title}
      </h1>}
      {description && (
         <div className="mt-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
           <div className="flex gap-2">
             <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
             <p className="text-sm font-medium text-foreground leading-relaxed break-words min-w-0">{description}</p>
           </div>
         </div>
       )}
    </div>
  );
}