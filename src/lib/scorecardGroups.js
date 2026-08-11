/**
 * Group a round's players into scorecard groups (one scorecard per group).
 * Mirrors the grouping used on Tournament Logistics so both pages print
 * identical layouts. Individual mode groups by tee time; team mode groups
 * by team (tee_group tag, falling back to tee time + auto-split).
 */
export function getScorecardGroups(round, players) {
  if (!round) return [];
  const roster = players || round.players || [];
  const isTeamMode =
    round.team_mode === true ||
    ["team_scramble", "team_best_ball", "team_6_6_6", "team_chapman", "team_aggregate"].includes(round.game_type);

  if (isTeamMode) {
    const teamSize = round.team_size || 2;
    // 6-6-6: one scorecard per team, independent of tee time
    if (round.game_type === "team_6_6_6") {
      const tagged = {};
      const untagged = [];
      for (const p of roster) {
        const tag = (p.tee_group || "").trim();
        if (tag) {
          if (!tagged[tag]) tagged[tag] = [];
          tagged[tag].push(p);
        } else {
          untagged.push(p);
        }
      }
      const teams = Object.keys(tagged).sort().map((t) => tagged[t]);
      untagged.sort((a, b) => (a.tee_time || "").localeCompare(b.tee_time || ""));
      for (let i = 0; i < untagged.length; i += teamSize) {
        teams.push(untagged.slice(i, i + teamSize));
      }
      return teams.length ? teams : [roster];
    }
    // Other team formats: each team (by tee_group tag) gets its own card.
    // Team membership is defined by the tag — NOT by tee time. Teammates
    // split across tee times still share one scorecard so they stay together.
    const hasGroupTags = roster.some((p) => p && (p.tee_group || "").trim());
    if (hasGroupTags) {
      const tagged = {};
      const untagged = [];
      for (const p of roster) {
        const tag = (p.tee_group || "").trim();
        if (tag) {
          if (!tagged[tag]) tagged[tag] = [];
          tagged[tag].push(p);
        } else {
          untagged.push(p);
        }
      }
      const groups = Object.keys(tagged).sort().map((t) => tagged[t]);
      untagged.sort((a, b) => (a.tee_time || "").localeCompare(b.tee_time || ""));
      for (let i = 0; i < untagged.length; i += teamSize) {
        groups.push(untagged.slice(i, i + teamSize));
      }
      return groups.length ? groups : [roster];
    }
    // No group tags: group by tee time, then auto-split into teams of teamSize
    const teeTimeGroups = {};
    for (const p of roster) {
      const teeTime = (p.tee_time || "").trim() || "\u2014";
      if (!teeTimeGroups[teeTime]) teeTimeGroups[teeTime] = [];
      teeTimeGroups[teeTime].push(p);
    }
    const sortedKeys = Object.keys(teeTimeGroups).sort();
    let groups = sortedKeys.map((k) => teeTimeGroups[k]);
    if (groups.length === 0) groups.push(roster);
    if (teamSize > 0) {
      const split = [];
      for (const group of groups) {
        for (let i = 0; i < group.length; i += teamSize) {
          split.push(group.slice(i, i + teamSize));
        }
      }
      groups = split.length > 0 ? split : groups;
    }
    return groups;
  }

  // Individual mode: group by tee time
  const teeTimeGroups = {};
  for (const p of roster) {
    const teeTime = (p.tee_time || "").trim();
    if (teeTime) {
      if (!teeTimeGroups[teeTime]) teeTimeGroups[teeTime] = [];
      teeTimeGroups[teeTime].push(p);
    }
  }
  const sortedTimes = Object.keys(teeTimeGroups).sort();
  const groups = sortedTimes.map((t) => teeTimeGroups[t]);
  if (groups.length === 0) groups.push(roster);
  return groups;
}

/**
 * Pack scorecard groups into print pages (3 per page in team mode, 2 otherwise).
 */
export function getPrintPages(groups, teamMode) {
  if (!groups || !groups.length) return [];
  // 2 scorecards per printed page — matches Tournament Logistics so both
  // pages produce identical printouts.
  const perPage = 2;
  return groups.reduce((pages, grp, i) => {
    if (i % perPage === 0) pages.push([]);
    pages[pages.length - 1].push(grp);
    return pages;
  }, []);
}