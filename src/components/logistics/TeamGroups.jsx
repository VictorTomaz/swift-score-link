import React, { useMemo } from "react";
import { Users, UserPlus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function TeamGroups({ previewPlayers, groupTags, onTagChange }) {
  const { tagged, untagged } = useMemo(() => {
    const t = {};
    const u = [];
    for (const p of previewPlayers) {
      const tag = (groupTags[p.player_id] || p.tee_group || "").trim();
      if (tag) {
        if (!t[tag]) t[tag] = [];
        t[tag].push(p);
      } else {
        u.push(p);
      }
    }
    return { tagged: t, untagged: u };
  }, [previewPlayers, groupTags]);

  const teamTags = Object.keys(tagged).sort();
  if (teamTags.length === 0 && untagged.length === 0) return null;

  const TagInput = ({ playerId }) => (
    <input
      type="text"
      value={groupTags[playerId] || ""}
      onChange={(e) => onTagChange(playerId, e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      placeholder="—"
      maxLength={3}
      className="ml-1 w-9 h-7 text-xs text-center rounded border border-border bg-background px-1 focus:outline-none focus:ring-1 focus:ring-primary"
      title="Group tag (e.g. A, B, C) for team assignment"
    />
  );

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Users className="w-4 h-4" /> Teams
        </h3>
        {teamTags.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No teams assigned yet. Use "Set Up Teams" above to auto-assign, or enter group tags for each player.
          </p>
        ) : (
          <div className="space-y-2">
            {teamTags.map((tag) => {
              return (
                <div key={tag} className="flex items-start gap-2">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground text-sm font-bold">
                      {tag}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {tagged[tag].map((p) => (
                      <span
                        key={p.player_id}
                        className="inline-flex items-center px-2.5 py-1.5 rounded-md text-sm font-medium bg-muted text-foreground"
                      >
                        {p.name}
                        <TagInput playerId={p.player_id} />
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {untagged.length > 0 && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <UserPlus className="w-3.5 h-3.5" /> Unassigned ({untagged.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {untagged.map((p) => (
                <div
                  key={p.player_id}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium border border-border bg-muted/50 text-foreground"
                >
                  {p.name}
                  <TagInput playerId={p.player_id} />
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}