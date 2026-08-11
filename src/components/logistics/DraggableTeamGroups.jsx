import React, { useMemo } from "react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { Users, UserPlus, GripVertical, SplitSquareHorizontal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Drag-and-drop team grouping.
 * Players can be dragged between team letters and the unassigned area.
 * Entire team rows can be reordered via the grip handle.
 *
 * NOTE: This component does NOT create its own DragDropContext — the parent
 * (TournamentLogistics) provides a single shared context. Droppables use
 * type="team" (player moves) and type="team-reorder" (row reordering) so
 * they never conflict with each other or with type="tee" droppables.
 *
 * @param {Array}    previewPlayers - all players (with tee_group merged)
 * @param {object}   groupTags      - { player_id: "A" }
 * @param {Array}    teamOrder      - team tags in display order (or null for alpha)
 * @param {function} onTagChange    - (playerId, value|null) => void
 */
export default function DraggableTeamGroups({ previewPlayers, groupTags, teamOrder, onTagChange }) {
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

  const allTags = Object.keys(tagged);
  const sortedTags = teamOrder
    ? [...teamOrder.filter((t) => allTags.includes(t)), ...allTags.filter((t) => !teamOrder.includes(t)).sort()]
    : allTags.sort();

  if (sortedTags.length === 0 && untagged.length === 0) return null;

  const handleSplit = (tag) => {
    const teamPlayers = tagged[tag];
    if (!teamPlayers || teamPlayers.length < 4) return;
    const usedTags = new Set(allTags);
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const newTag = letters.find((l) => !usedTags.has(l)) || `T${allTags.length + 1}`;
    const half = Math.ceil(teamPlayers.length / 2);
    teamPlayers.slice(half).forEach((p) => onTagChange(p.player_id, newTag));
  };

  const PlayerChip = ({ p, index }) => (
    <Draggable draggableId={p.player_id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          style={{
            ...provided.draggableProps.style,
            ...provided.dragHandleProps.style,
            touchAction: 'none',
          }}
          className={`inline-flex items-center px-2.5 py-1.5 rounded-md text-sm font-medium transition-shadow select-none cursor-grab active:cursor-grabbing ${
            snapshot.isDragging
              ? "bg-primary text-primary-foreground shadow-lg z-50"
              : "bg-muted text-foreground hover:bg-muted/80"
          }`}
        >
          {p.name}
        </div>
      )}
    </Draggable>
  );

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Users className="w-4 h-4" /> Teams
        </h3>

        {sortedTags.length === 0 && untagged.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Drag players into a team column, or use "Set Up Teams" above to auto-assign.
          </p>
        )}

        {sortedTags.length > 1 && (
          <p className="text-xs text-muted-foreground">
            Drag the grip handle to reorder teams.
          </p>
        )}

        <Droppable droppableId="team-list" type="team-reorder" direction="vertical">
          {(dropProvided) => (
            <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="space-y-2">
              {sortedTags.map((tag, index) => (
                <Draggable key={tag} draggableId={`team-row-${tag}`} index={index}>
                  {(dragProvided, dragSnapshot) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      style={dragProvided.draggableProps.style}
                      className={`flex items-start gap-2 rounded-lg transition-shadow ${
                        dragSnapshot.isDragging ? "shadow-lg bg-card z-50" : ""
                      }`}
                    >
                      <div
                        {...dragProvided.dragHandleProps}
                        style={{
                          ...dragProvided.dragHandleProps.style,
                          touchAction: 'none',
                        }}
                        className="flex items-center gap-1 shrink-0 cursor-grab active:cursor-grabbing pt-1"
                      >
                        <GripVertical className="w-4 h-4 text-muted-foreground" />
                        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary text-primary-foreground text-sm font-bold">
                          {tag}
                        </div>
                      </div>
                      <Droppable droppableId={tag} type="team" direction="horizontal">
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`flex flex-wrap gap-1.5 pt-0.5 flex-1 min-h-[44px] rounded-md transition-colors ${
                              snapshot.isDraggingOver ? "bg-primary/5" : ""
                            }`}
                          >
                            {tagged[tag].map((p, i) => (
                              <PlayerChip key={p.player_id} p={p} index={i} />
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                      {tagged[tag].length >= 4 && (
                        <button
                          onClick={() => handleSplit(tag)}
                          className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title={`Split ${tag} into two groups`}
                        >
                          <SplitSquareHorizontal className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </Draggable>
              ))}
              {dropProvided.placeholder}
            </div>
          )}
        </Droppable>

        {untagged.length > 0 && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <UserPlus className="w-3.5 h-3.5" /> Unassigned ({untagged.length})
            </p>
            <Droppable droppableId="team-unassigned" type="team" direction="horizontal">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`flex flex-wrap gap-2 min-h-[44px] rounded-md transition-colors ${
                    snapshot.isDraggingOver ? "bg-primary/5" : ""
                  }`}
                >
                  {untagged.map((p, i) => (
                    <PlayerChip key={p.player_id} p={p} index={i} />
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        )}
      </CardContent>
    </Card>
  );
}