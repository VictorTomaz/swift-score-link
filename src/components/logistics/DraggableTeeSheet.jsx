import React from "react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { Check, UserPlus, GripVertical } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * Group-tag input — extracted to module level so it has a STABLE identity
 * across re-renders. Defining it inside the component body created a new
 * component type each render, causing React to unmount/remount the input
 * inside Draggable elements during drags — which triggered
 * "Cannot release lock when there is no lock" in @hello-pangea/dnd.
 */
function TagInput({ playerId, value, onChange, className = "" }) {
  return (
    <input
      type="text"
      value={value || ""}
      onChange={(e) => onChange(playerId, e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      placeholder="—"
      maxLength={3}
      className={`w-8 h-7 text-xs text-center rounded border border-border bg-background px-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary ${className}`}
      title="Group tag (e.g. A, B, C) for scorecard grouping"
    />
  );
}

/** Extract distinct team tags from a list of players (sorted alphabetically). */
function getTeamTags(players, groupTags) {
  const tags = [];
  const seen = new Set();
  for (const p of players) {
    const tag = (groupTags[p.player_id] || p.tee_group || "").trim();
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }
  return tags.sort();
}

/**
 * Drag-and-drop tee time assignment.
 * Players can be dragged between tee time slots and the unassigned area.
 * Entire team groups can also be dragged via the team badge.
 *
 * NOTE: This component does NOT create its own DragDropContext — the parent
 * (TournamentLogistics) provides a single shared context so this and
 * DraggableTeamGroups don't conflict.
 *
 * Two drag types are used:
 *  - type="tee": individual player chips (inner Droppable per slot)
 *  - type="tee-group": whole-team badges (outer Droppable per slot)
 */
export default function DraggableTeeSheet({
  slotsWithPlayers,
  unassignedPlayers,
  groupTags,
  groupSize,
  onTagChange,
}) {
  const renderPlayerChip = (p, index) => (
    <Draggable key={p.player_id} draggableId={p.player_id} index={index}>
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
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm font-medium transition-shadow select-none cursor-grab active:cursor-grabbing ${
            snapshot.isDragging
              ? "bg-primary text-primary-foreground shadow-lg z-50"
              : "bg-muted text-foreground hover:bg-muted/80"
          }`}
        >
          <span>{p.name}</span>
          <TagInput playerId={p.player_id} value={groupTags[p.player_id]} onChange={onTagChange} />
        </div>
      )}
    </Draggable>
  );

  const renderTeamBadge = (tag, index, sourceId) => (
    <Draggable key={`badge-${sourceId}-${tag}`} draggableId={`tee-group-${sourceId}_${tag}`} index={index}>
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
          className={`flex items-center gap-0.5 px-2 py-1 rounded-md text-xs font-bold cursor-grab active:cursor-grabbing select-none ${
            snapshot.isDragging
              ? "bg-primary text-primary-foreground shadow-lg z-50"
              : "bg-primary/15 text-primary"
          }`}
          title={`Drag team ${tag} to another tee time`}
        >
          <GripVertical className="w-3 h-3" />
          {tag}
        </div>
      )}
    </Draggable>
  );

  return (
    <div className="space-y-2">
      {slotsWithPlayers.map(({ time, players: slotPlayers }) => {
        const isFull = slotPlayers.length >= groupSize;
        const teamTags = getTeamTags(slotPlayers, groupTags);
        return (
          <Droppable key={time} droppableId={`tee-group-${time}`} type="tee-group" direction="horizontal">
            {(groupProvided, groupSnapshot) => (
              <div
                ref={groupProvided.innerRef}
                {...groupProvided.droppableProps}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  groupSnapshot.isDraggingOver
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card"
                } ${isFull ? "opacity-90" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-16 shrink-0">
                    <div className="text-base font-bold text-foreground">{time}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {slotPlayers.length}/{groupSize}
                    </div>
                  </div>
                  {teamTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 items-center shrink-0">
                      {teamTags.map((tag, ti) => renderTeamBadge(tag, ti, time))}
                    </div>
                  )}
                  {groupProvided.placeholder}
                  <div className="flex-1 min-w-0">
                    <Droppable droppableId={time} type="tee" direction="horizontal">
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className="flex flex-wrap gap-1.5 min-h-[36px]"
                        >
                          {slotPlayers.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">
                              {snapshot.isDraggingOver ? "Drop here" : "Empty — drag a player here"}
                            </p>
                          ) : (
                            slotPlayers.map((p, i) => renderPlayerChip(p, i))
                          )}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                  {isFull && <Check className="w-4 h-4 text-primary shrink-0" />}
                </div>
              </div>
            )}
          </Droppable>
        );
      })}

      {/* Unassigned drop zone — accepts both individual players and team groups */}
      <Droppable droppableId="tee-group-unassigned" type="tee-group" direction="horizontal">
        {(groupProvided, groupSnapshot) => (
          <Card
            ref={groupProvided.innerRef}
            {...groupProvided.droppableProps}
            className={`border-0 shadow-sm transition-colors ${
              groupSnapshot.isDraggingOver ? "ring-2 ring-primary/40 bg-primary/5" : ""
            }`}
          >
            <div className="p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <UserPlus className="w-4 h-4" /> Unassigned ({unassignedPlayers.length})
              </h3>
              <Droppable droppableId="tee-unassigned" type="tee" direction="horizontal">
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="flex flex-wrap gap-2 min-h-[44px]"
                  >
                    {unassignedPlayers.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Drop a player or team here to unassign</p>
                    ) : (
                      unassignedPlayers.map((p, i) => (
                        <Draggable key={p.player_id} draggableId={p.player_id} index={i}>
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
                              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium border border-border transition-shadow select-none cursor-grab active:cursor-grabbing ${
                                snapshot.isDragging
                                  ? "bg-primary text-primary-foreground shadow-lg z-50"
                                  : "bg-muted/50 text-foreground hover:bg-muted"
                              }`}
                            >
                              <span>{p.name}</span>
                              <TagInput playerId={p.player_id} value={groupTags[p.player_id]} onChange={onTagChange} className="ml-1 w-9" />
                            </div>
                          )}
                        </Draggable>
                      ))
                    )}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
              {groupProvided.placeholder}
            </div>
          </Card>
        )}
      </Droppable>
    </div>
  );
}