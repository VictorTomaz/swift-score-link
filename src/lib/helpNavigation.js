// Shared parser for the Help Assistant's navigation markers: [[goto:/Path?id=x|Label]]
const GOTO_RE = /\[\[goto:([^\]|]+)\|([^\]]+)\]\]/g;

export function parseGotoActions(text) {
  const actions = [];
  const raw = text || "";
  GOTO_RE.lastIndex = 0;
  let m;
  while ((m = GOTO_RE.exec(raw)) !== null) {
    actions.push({ path: m[1].trim(), label: m[2].trim() });
  }
  return actions;
}

export function stripGotoMarkers(text) {
  return (text || "").replace(GOTO_RE, "").trim();
}