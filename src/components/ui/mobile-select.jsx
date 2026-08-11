import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export default function MobileSelect({
  value,
  onValueChange,
  placeholder,
  children,
  label,
  ...props
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  // Flatten children to handle arrays/fragments safely
  const flatChildren = Array.isArray(children) ? children.flat().filter(Boolean) : (children ? [children] : []);
  const selectedLabel = flatChildren.find(c => c?.props?.value === value)?.props?.children;

  if (!isMobile) {
    return (
      <Select value={value} onValueChange={onValueChange} {...props}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-md border border-input bg-background text-sm text-foreground min-h-[44px]"
      >
        <span className={cn(!value && "text-muted-foreground")}>
          {selectedLabel || placeholder}
        </span>
        <svg className="w-4 h-4 text-muted-foreground flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{label || placeholder || "Select option"}</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col overflow-y-auto max-h-[60vh] pb-6" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
            {flatChildren.map((child) => {
              if (!child?.props?.value) return null;
              const isSelected = value === child.props.value;
              return (
                <button
                  key={child.props.value}
                  type="button"
                  onClick={() => {
                    onValueChange(child.props.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex items-center justify-between w-full px-6 py-4 text-base border-b border-border/50 transition-colors active:bg-muted",
                    isSelected ? "text-primary font-semibold bg-primary/5" : "text-foreground"
                  )}
                  style={{ minHeight: '52px' }}
                >
                  <span>{child.props.children}</span>
                  {isSelected && <Check className="w-5 h-5 text-primary flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}