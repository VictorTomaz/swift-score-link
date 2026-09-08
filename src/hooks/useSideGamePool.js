import { useState, useRef, useEffect } from "react";
import { toStoredPoolIds, toSelectedPoolIds } from "@/lib/sideGamePools";

// Keeps one side-game pool's checkbox selection authoritative.
//
// The round record is large, so its realtime broadcast is sometimes sent with
// fields stripped. When that happened the pool field arrived as undefined and
// the old resync read it as "never configured" → every box snapped back on,
// silently discarding what the organizer had just unchecked.
//
// Here the last selection we persisted wins: an incoming value is only adopted
// when it is actually present, so a stripped broadcast can never re-check boxes.
export default function useSideGamePool(storedIds, allPlayerIds, save) {
  const [selectedIds, setSelectedIds] = useState(() => toSelectedPoolIds(storedIds, allPlayerIds));
  const savedRef = useRef(null);

  useEffect(() => {
    // Stripped/absent field — keep whatever we last persisted.
    if (storedIds === undefined || storedIds === null) return;
    // Ignore the echo of our own save.
    if (savedRef.current && JSON.stringify(storedIds) === JSON.stringify(savedRef.current)) return;
    setSelectedIds(toSelectedPoolIds(storedIds, allPlayerIds));
  }, [JSON.stringify(storedIds), allPlayerIds.length]);

  const update = (ids) => {
    const stored = toStoredPoolIds(ids);
    savedRef.current = stored;
    setSelectedIds(ids);
    save(stored);
  };

  const toggle = (playerId) => {
    update(selectedIds.includes(playerId)
      ? selectedIds.filter(id => id !== playerId)
      : [...selectedIds, playerId]);
  };

  return { selectedIds, update, toggle };
}