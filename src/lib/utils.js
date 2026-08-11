import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
} 


export const isIframe = window.self !== window.top;

/**
 * Whether window.print() can open a native print dialog. The Base44 native
 * app wraps the app in a WKWebView (iOS) / Android WebView, where
 * window.print() is a no-op — nothing happens on tap. In those contexts we
 * fall back to generating a PDF and opening it so the user can print/share
 * via the OS share sheet. Regular mobile/desktop browsers support print.
 */
export function canUseWindowPrint() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return true;
  const ua = navigator.userAgent || "";
  // iOS: Base44 wrapper is a bare WKWebView — Safari/CriOS/FxiOS tokens are
  // only present in actual browser apps.
  const isIOSDevice = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isIOSBrowser = isIOSDevice && /Safari|CriOS|FxiOS/.test(ua);
  if (isIOSDevice && !isIOSBrowser) return false;
  // Android: the system WebView used by native wrappers carries the "wv" token.
  if (/Android/.test(ua) && /wv/.test(ua)) return false;
  return true;
}