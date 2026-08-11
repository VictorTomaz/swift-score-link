/**
 * Surface a generated PDF to the user in a way that works in both regular
 * browsers and the native app's WebView.
 *
 * The native iOS/Android WebView silently ignores programmatic
 * `<a download="...">` clicks, so a "download" never actually delivers a file
 * (the success toast fires but nothing appears). The Web Share API
 * (`navigator.share` with a File) opens the native share sheet, giving the
 * user Print / Save to Files / AirDrop — the only reliable path in a WebView.
 * Browsers without file-sharing fall back to the blob + anchor download.
 *
 * Returns once the share sheet is dismissed (or the fallback download runs).
 * Throws on real errors; an AbortError (user cancelled the sheet) is swallowed.
 */
export async function shareOrDownloadPdf(url, filename) {
  const blobRes = await fetch(url);
  const blob = await blobRes.blob();
  const file = new File([blob], filename, { type: "application/pdf" });

  if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return; // user dismissed the share sheet
      // iOS revokes the "user gesture" if generation took more than a couple
      // of seconds, making navigator.share throw NotAllowedError — the share
      // sheet silently never appears. Fall through and open the PDF directly
      // so the user always sees the file.
    }
    const win = window.open(url, "_blank");
    if (!win) window.location.href = url;
    return;
  }

  // Fallback: blob + anchor download (regular browsers; no-op in a WebView)
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}