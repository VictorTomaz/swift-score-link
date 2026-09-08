import React, { useState, useEffect, useRef, useCallback } from "react";
import { MessageCircle, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import HelpChatPanel from "@/components/help-assistant/HelpChatPanel";

const HIDDEN_KEY = "ss_help_button_hidden";
const POS_KEY = "ss_help_button_pos";

const BTN_SIZE = 56; // w-14 h-14
const MARGIN = 16;
const DRAG_THRESHOLD = 6; // px before a tap becomes a drag

function loadPos() {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.x !== "number" || typeof p?.y !== "number") return null;
    return p;
  } catch { return null; }
}

function clampPos(x, y) {
  const maxX = window.innerWidth - BTN_SIZE - MARGIN;
  const maxY = window.innerHeight - BTN_SIZE - MARGIN;
  return {
    x: Math.min(Math.max(x, MARGIN), Math.max(MARGIN, maxX)),
    y: Math.min(Math.max(y, MARGIN), Math.max(MARGIN, maxY)),
  };
}

export default function HelpAssistant() {
  const [hidden, setHidden] = useState(() => localStorage.getItem(HIDDEN_KEY) === "true");
  const [chatOpen, setChatOpen] = useState(false);
  const [confirmHide, setConfirmHide] = useState(false);
  const [pos, setPos] = useState(() => {
    const saved = loadPos();
    if (saved) return clampPos(saved.x, saved.y);
    // Default: bottom-right, above the mobile tab bar
    return { x: window.innerWidth - BTN_SIZE - MARGIN, y: window.innerHeight - 96 - BTN_SIZE - MARGIN };
  });

  const dragState = useRef({ dragging: false, moved: false, startX: 0, startY: 0, originX: 0, originY: 0, pointerId: null });

  useEffect(() => {
    const onVisibility = () => setHidden(localStorage.getItem(HIDDEN_KEY) === "true");
    const onOpen = () => setChatOpen(true);
    window.addEventListener("ss-help-button-visibility", onVisibility);
    window.addEventListener("ss-open-help-assistant", onOpen);
    return () => {
      window.removeEventListener("ss-help-button-visibility", onVisibility);
      window.removeEventListener("ss-open-help-assistant", onOpen);
    };
  }, []);

  // Keep button on-screen when the viewport changes (rotate, resize, keyboard)
  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p.x, p.y));
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  const onPointerDown = useCallback((e) => {
    if (e.button != null && e.button !== 0) return; // left click / touch only
    const ds = dragState.current;
    ds.dragging = true;
    ds.moved = false;
    ds.startX = e.clientX;
    ds.startY = e.clientY;
    ds.originX = pos.x;
    ds.originY = pos.y;
    ds.pointerId = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, [pos.x, pos.y]);

  const onPointerMove = useCallback((e) => {
    const ds = dragState.current;
    if (!ds.dragging || ds.pointerId !== e.pointerId) return;
    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    if (!ds.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    ds.moved = true;
    setPos(clampPos(ds.originX + dx, ds.originY + dy));
  }, []);

  const onPointerUp = useCallback((e) => {
    const ds = dragState.current;
    if (!ds.dragging || ds.pointerId !== e.pointerId) return;
    ds.dragging = false;
    ds.pointerId = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (ds.moved) {
      setPos((p) => {
        const clamped = clampPos(p.x, p.y);
        localStorage.setItem(POS_KEY, JSON.stringify(clamped));
        return clamped;
      });
    }
  }, []);

  const onMainClick = useCallback(() => {
    if (dragState.current.moved) return; // it was a drag, not a tap
    setChatOpen(true);
  }, []);

  const hideButton = () => {
    localStorage.setItem(HIDDEN_KEY, "true");
    setHidden(true);
    setConfirmHide(false);
    toast.success("Helper hidden — you can re-enable it from Settings.");
  };

  if (hidden) {
    return <HelpChatPanel open={chatOpen} onOpenChange={setChatOpen} />;
  }

  return (
    <>
      <div
        className="fixed z-40 touch-none select-none"
        style={{ left: pos.x, top: pos.y, width: BTN_SIZE, height: BTN_SIZE }}
      >
        <button
          type="button"
          aria-label="Open Helper — drag to move"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={onMainClick}
          className="w-full h-full rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-colors cursor-grab"
        >
          <MessageCircle className="w-6 h-6 pointer-events-none" />
        </button>
        <button
          type="button"
          onClick={() => setConfirmHide(true)}
          aria-label="Hide Helper button"
          className="absolute -top-1.5 -right-1.5 w-6 h-6 min-h-0 rounded-full bg-muted border border-border text-muted-foreground flex items-center justify-center shadow-sm hover:text-foreground"
        >
          <X className="w-3.5 h-3.5 pointer-events-none" />
        </button>
      </div>

      <AlertDialog open={confirmHide} onOpenChange={setConfirmHide}>
        <AlertDialogContent>
          <AlertDialogTitle>Hide the Help button?</AlertDialogTitle>
          <AlertDialogDescription>
            The floating Helper button will be removed from your screen. You can bring it back anytime from Settings.
          </AlertDialogDescription>
          <div className="flex gap-3 justify-end mt-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={hideButton}>Hide It</AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <HelpChatPanel open={chatOpen} onOpenChange={setChatOpen} />
    </>
  );
}