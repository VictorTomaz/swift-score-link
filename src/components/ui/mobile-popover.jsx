import { useState } from "react";
import { useMediaQuery } from "@/hooks/use-mobile";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

export default function MobilePopover({
  trigger,
  children,
  title,
  ...props
}) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [open, setOpen] = useState(false);

  if (!isMobile) {
    return (
      <Popover {...props}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent>{children}</PopoverContent>
      </Popover>
    );
  }

  return (
    <>
      <div onClick={() => setOpen(true)}>{trigger}</div>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          {title && (
            <DrawerHeader>
              <DrawerTitle>{title}</DrawerTitle>
            </DrawerHeader>
          )}
          <div className="p-4">{children}</div>
        </DrawerContent>
      </Drawer>
    </>
  );
}