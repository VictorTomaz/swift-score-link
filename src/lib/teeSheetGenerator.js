// Tee sheet auto-generation algorithms

/**
 * Generate a list of tee time slots from config.
 * @returns string[] of "HH:MM" times
 */
export function generateTimeSlots(startTime, intervalMinutes, playerCount, groupSize) {
  const [h, m] = startTime.split(':').map(Number);
  const base = h * 60 + m;
  const numSlots = Math.max(1, Math.ceil(playerCount / groupSize));
  const slots = [];
  for (let i = 0; i < numSlots; i++) {
    const total = base + i * intervalMinutes;
    const hh = Math.floor((total / 60) % 24);
    const mm = total % 60;
    slots.push(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  }
  return slots;
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getHandicap(p) {
  return p.course_handicap ?? p.handicap ?? 0;
}

// Effective handicap for sorting/balancing: plus-handicap players are
// better than scratch, so treat them as negative so they sort to the top.
function effectiveHandicap(p) {
  const h = getHandicap(p);
  return p.is_plus_handicap ? -Math.abs(h) : h;
}

/**
 * Snake draft: sort by effective handicap, then distribute across slots
 * so each slot gets a mix of high and low handicaps — keeping combined
 * team handicaps as even as possible.
 */
function snakeDraft(players, numSlots) {
  const sorted = [...players].sort((a, b) => effectiveHandicap(a) - effectiveHandicap(b));
  const groups = Array.from({ length: numSlots }, () => []);
  sorted.forEach((p, i) => {
    const cycle = Math.floor(i / numSlots);
    const posInCycle = i % numSlots;
    const groupIdx = cycle % 2 === 0 ? posInCycle : numSlots - 1 - posInCycle;
    groups[groupIdx].push(p);
  });
  return groups.flat();
}

/**
 * Group priority: keep players with the same `tee_group` tag together
 * in the same tee time, then fill remaining slots with ungrouped players.
 * Returns a direct assignment map so groups never straddle slot boundaries.
 */
function groupPriorityAssign(players, slots, groupSize) {
  const tagged = {};
  const ungrouped = [];
  players.forEach(p => {
    const tag = p.tee_group;
    if (tag) {
      if (!tagged[tag]) tagged[tag] = [];
      tagged[tag].push(p);
    } else {
      ungrouped.push(p);
    }
  });

  const assignments = {};
  const numSlots = slots.length;
  const slotCounts = new Array(numSlots).fill(0);

  // Sort tagged groups by tag name (alphabetical) so tee times follow team order (A, B, C…)
  const sortedTags = Object.keys(tagged).sort();
  let slotIdx = 0;

  // Assign each tagged group to the next available slot with room.
  // Multiple small teams share a slot so twosomes combine into foursomes
  // (e.g. teams A+B → slot 0, C+D → slot 1) instead of each getting its own.
  for (const tag of sortedTags) {
    const group = tagged[tag];
    if (group.length <= groupSize) {
      // Find the first slot that has room for this whole group
      while (slotIdx < numSlots && slotCounts[slotIdx] + group.length > groupSize) {
        slotIdx++;
      }
      const target = Math.min(slotIdx, numSlots - 1);
      for (const p of group) {
        assignments[p.player_id] = slots[target];
        slotCounts[target]++;
      }
      // Stay on the current slot if it still has room for another team;
      // only advance when it's full.
      if (slotCounts[target] >= groupSize) {
        slotIdx = target + 1;
      } else {
        slotIdx = target;
      }
    } else {
      // Group too large — split into even sub-groups across consecutive slots
      const numSubGroups = Math.ceil(group.length / groupSize);
      const subSize = Math.ceil(group.length / numSubGroups);
      for (let gi = 0; gi < group.length; gi += subSize) {
        const subGroup = group.slice(gi, gi + subSize);
        while (slotIdx < numSlots && slotCounts[slotIdx] + subGroup.length > groupSize) {
          slotIdx++;
        }
        const target = Math.min(slotIdx, numSlots - 1);
        for (const p of subGroup) {
          assignments[p.player_id] = slots[target];
          slotCounts[target]++;
        }
        if (slotCounts[target] >= groupSize) {
          slotIdx = target + 1;
        } else {
          slotIdx = target;
        }
      }
    }
  }

  // Fill remaining spots with ungrouped players
  let fillIdx = 0;
  for (const p of shuffle(ungrouped)) {
    while (fillIdx < numSlots && slotCounts[fillIdx] >= groupSize) {
      fillIdx++;
    }
    let target = fillIdx < numSlots ? fillIdx : 0;
    let attempts = 0;
    while (slotCounts[target] >= groupSize && attempts < numSlots) {
      target = (target + 1) % numSlots;
      attempts++;
    }
    assignments[p.player_id] = slots[target];
    slotCounts[target]++;
  }

  return assignments;
}

/**
 * Diversified: distribute players so that same-tagged players
 * are separated across different tee times.
 */
function diversified(players, numSlots) {
  const groups = Array.from({ length: numSlots }, () => []);
  // Shuffle first so untagged players get variety
  const shuffled = shuffle(players);
  const tagCount = {};
  shuffled.forEach(p => {
    const tag = p.tee_group;
    if (tag) {
      tagCount[tag] = (tagCount[tag] || 0) % numSlots;
      groups[tagCount[tag]].push(p);
      tagCount[tag]++;
    } else {
      // Untagged players fill the smallest groups first
      const minG = groups.indexOf(groups.reduce((a, b) => (a.length <= b.length ? a : b)));
      groups[minG].push(p);
    }
  });
  return groups.flat();
}

/**
 * Reorder the assigned tee times so that smaller groups go out first.
 * Group membership is preserved — only the time labels are swapped so the
 * smallest resulting group gets the earliest slot, the next smallest the
 * next slot, etc. (e.g. sizes 4,3,3 become 3,3,4 across the tee times).
 */
function reorderSmallestFirst(assignments, slots) {
  const counts = {};
  Object.values(assignments).forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
  const usedTimes = slots.filter((t) => counts[t] !== undefined);
  if (usedTimes.length <= 1) return assignments;
  // Smallest group first; ties keep chronological order
  const bySize = [...usedTimes].sort((a, b) => {
    const c = counts[a] - counts[b];
    return c !== 0 ? c : slots.indexOf(a) - slots.indexOf(b);
  });
  const remap = {};
  bySize.forEach((oldTime, i) => { remap[oldTime] = usedTimes[i]; });
  const result = {};
  Object.entries(assignments).forEach(([pid, t]) => { result[pid] = remap[t] || t; });
  return result;
}

/**
 * Assign players to tee times based on the chosen algorithm.
 * @returns { [player_id]: "HH:MM" } map
 */
export function assignTeeTimes(players, slots, groupSize, algorithm) {
  let assignments;
  // Group priority returns a direct assignment map (groups must stay together)
  if (algorithm === 'group_priority') {
    assignments = groupPriorityAssign(players, slots, groupSize);
  } else {
    const numSlots = slots.length;
    let ordered;
    switch (algorithm) {
      case 'handicap_balanced':
        ordered = snakeDraft(players, numSlots);
        break;
      case 'handicap_grouped':
        ordered = [...players].sort((a, b) => getHandicap(a) - getHandicap(b));
        break;
      case 'diversified':
        ordered = diversified(players, numSlots);
        break;
      case 'sequential':
        ordered = players;
        break;
      case 'pure_random':
      default:
        ordered = shuffle(players);
        break;
    }
    assignments = {};
    const total = ordered.length;
    const base = Math.floor(total / numSlots);
    let remainder = total % numSlots;
    let idx = 0;
    for (let s = 0; s < numSlots && idx < total; s++) {
      // Distribute the remainder so groups differ by at most 1 player
      // (e.g. 10 players / 3 slots → 4,3,3 instead of 4,4,2)
      const groupLen = base + (remainder > 0 ? 1 : 0);
      remainder = Math.max(0, remainder - 1);
      const time = slots[s];
      for (let i = 0; i < groupLen && idx < total; i++) {
        const p = ordered[idx];
        if (p.player_id) assignments[p.player_id] = time;
        idx++;
      }
    }
  }
  // Group priority: preserve team order — don't reorder by group size
  if (algorithm === 'group_priority') {
    return assignments;
  }
  // Other algorithms: smaller groups go out first
  return reorderSmallestFirst(assignments, slots);
}

export const ALGORITHMS = [
  { value: 'pure_random', label: 'Pure Random', description: 'Shuffle everyone randomly' },
  { value: 'handicap_balanced', label: 'Handicap Balanced', description: 'Mix skill levels across groups' },
  { value: 'handicap_grouped', label: 'Handicap Grouped', description: 'Group similar handicaps together' },
  { value: 'diversified', label: 'Diversified', description: 'Separate tagged players across tee times' },
  { value: 'group_priority', label: 'Group Priority', description: 'Keep tagged players in the same tee time' },
  { value: 'sequential', label: 'Sequential', description: 'Fill in roster order' },
];