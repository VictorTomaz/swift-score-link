import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ScanLine, CheckCircle2, Plus, ImageIcon, RotateCcw, X, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const formatHandicapForDisplay = (handicap, isPlusHandicap) => {
  if (handicap === undefined || handicap === null) return "";
  return isPlusHandicap ? `+${handicap}` : `${handicap}`;
};

const parseHandicapString = (str) => {
  const trimmed = (str || "").trim();
  let isPlus = false;
  let numStr = trimmed;
  if (trimmed.startsWith("+")) {
    isPlus = true;
    numStr = trimmed.slice(1).trim();
  }
  const num = parseFloat(numStr);
  return { handicap: isNaN(num) ? 0 : Math.abs(num), is_plus_handicap: isPlus };
};

export default function HandicapSyncModal({ open, onOpenChange, existingPlayers }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState("");
  const [extractedPlayers, setExtractedPlayers] = useState([]);
  const [error, setError] = useState(null);
  const [isCommitting, setIsCommitting] = useState(false);

  const resetState = () => {
    setSelectedFiles([]);
    setExtractedPlayers([]);
    setError(null);
    setProcessingLabel("");
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      toast.error("Please select image files");
      return;
    }
    if (imageFiles.length < files.length) {
      toast.error("Some files were skipped (not images)");
    }
    setSelectedFiles((prev) => [...prev, ...imageFiles]);
    setExtractedPlayers([]);
    setError(null);
    e.target.value = "";
  };

  const removeFile = (idx) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const findMatch = (name) => {
    const normalized = name.toLowerCase().trim();
    return existingPlayers.find(
      (ep) => ep.name.toLowerCase().trim() === normalized
    );
  };

  const handleExtract = async () => {
    if (selectedFiles.length === 0) return;
    setIsProcessing(true);
    setError(null);
    setExtractedPlayers([]);

    const prompt = `You are analyzing a screenshot from a golf handicap app (USGA/GHIN or similar).
Extract all player names and their Handicap Index (H.I.) values from this screenshot.

For each player found, provide:
- name: The player's full name as shown
- handicap_index: The H.I. value as a string (e.g., "13.8" or "+1.2" if plus handicap)

IMPORTANT: Only extract the H.I. (Handicap Index) value. Do NOT extract C.H. (Course Handicap), P.H. (Playing Handicap), or S.O. (Strokes Off).
If a name is partially cut off, still include it with whatever is visible.
Return ALL players found in the screenshot.`;

    const allPlayers = [];
    const failedFiles = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setProcessingLabel(`Processing image ${i + 1} of ${selectedFiles.length}...`);
        try {
          const uploadResult = await base44.integrations.Core.UploadFile({ file });
          const fileUrl = uploadResult.file_url;

          const result = await base44.integrations.Core.InvokeLLM({
            prompt,
            file_urls: [fileUrl],
            response_json_schema: {
              type: "object",
              properties: {
                players: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      handicap_index: { type: "string" },
                    },
                    required: ["name", "handicap_index"],
                  },
                },
              },
            },
          });

          const players = result.players || [];
          if (players.length === 0) {
            failedFiles.push(file.name);
          } else {
            allPlayers.push(...players);
          }
        } catch (err) {
          failedFiles.push(file.name);
        }
      }

      setProcessingLabel("");

      if (allPlayers.length === 0) {
        setError("No players found in any screenshot. Try clearer images.");
        return;
      }

      // Deduplicate by normalized name — keep last occurrence (likely most recent screenshot)
      const deduped = [];
      const seenIndices = new Map();
      allPlayers.forEach((p) => {
        const key = p.name.toLowerCase().trim();
        seenIndices.set(key, p);
      });
      seenIndices.forEach((p) => deduped.push(p));

      const enriched = deduped.map((p) => {
        const matched = findMatch(p.name);
        const oldHandicapDisplay = matched
          ? formatHandicapForDisplay(matched.handicap, matched.is_plus_handicap)
          : null;
        return {
          name: p.name,
          handicap_index: p.handicap_index,
          matchedPlayerId: matched?.id || null,
          matchedPlayerName: matched?.name || null,
          oldHandicapDisplay,
          selected: true,
        };
      });

      setExtractedPlayers(enriched);

      if (failedFiles.length > 0) {
        toast.warning(`${failedFiles.length} image(s) had no extractable data`);
      }
    } catch (err) {
      setError("Something went wrong during extraction. Please try again.");
    } finally {
      setIsProcessing(false);
      setProcessingLabel("");
    }
  };

  const updatePlayer = (idx, field, value) => {
    setExtractedPlayers((prev) =>
      prev.map((p, i) => {
        if (i !== idx) return p;
        const updated = { ...p, [field]: value };
        if (field === "name") {
          const matched = findMatch(value);
          updated.matchedPlayerId = matched?.id || null;
          updated.matchedPlayerName = matched?.name || null;
        }
        return updated;
      })
    );
  };

  const togglePlayer = (idx) => {
    setExtractedPlayers((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, selected: !p.selected } : p))
    );
  };

  const handleCommit = async () => {
    const selected = extractedPlayers.filter((p) => p.selected);
    if (selected.length === 0) {
      toast.error("No players selected");
      return;
    }

    setIsCommitting(true);
    try {
      const toUpdate = [];
      const toCreate = [];
      const seenPlayerIds = new Set();
      const seenNewNames = new Set();

      selected.forEach((p) => {
        const { handicap, is_plus_handicap } = parseHandicapString(p.handicap_index);
        const matched = findMatch(p.name);
        const playerId = matched?.id || p.matchedPlayerId;
        const normalizedName = p.name.toLowerCase().trim();

        if (playerId && !seenPlayerIds.has(playerId)) {
          toUpdate.push({ id: playerId, handicap, is_plus_handicap });
          seenPlayerIds.add(playerId);
        } else if (!playerId && !seenNewNames.has(normalizedName)) {
          toCreate.push({ name: p.name, handicap, is_plus_handicap });
          seenNewNames.add(normalizedName);
        }
      });

      if (toUpdate.length > 0) {
        await base44.entities.Player.bulkUpdate(toUpdate);
      }
      if (toCreate.length > 0) {
        await base44.entities.Player.bulkCreate(toCreate);
      }

      await queryClient.invalidateQueries({ queryKey: ["players"] });
      toast.success(`Synced ${selected.length} player${selected.length > 1 ? "s" : ""}`);
      resetState();
      onOpenChange(false);
    } catch (err) {
      toast.error("Failed to sync: " + (err.message || "Unknown error"));
    } finally {
      setIsCommitting(false);
    }
  };

  const handleClose = (open) => {
    if (!open && (isProcessing || isCommitting)) {
      return;
    }
    if (!open) {
      resetState();
    }
    onOpenChange(open);
  };

  const selectedCount = extractedPlayers.filter((p) => p.selected).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => {
          if (isProcessing || isCommitting) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isProcessing || isCommitting) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="w-5 h-5" />
            Sync Handicaps from Screenshot
          </DialogTitle>
          <DialogDescription>
            Upload one or more screenshots from your handicap app. We'll extract player names and handicap indexes for you to review before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="text-xs text-muted-foreground bg-muted/50 border border-border rounded-lg px-3 py-2 space-y-1">
          <p className="font-medium">Disclaimer</p>
          <p>
            This tool reads the handicap index visible in screenshots you provide. It is not affiliated with, endorsed by, or connected to GHIN, the USGA, or any handicap service. You are responsible for verifying the accuracy of all extracted data before saving. Swift Score does not guarantee the correctness of AI-extracted values.
          </p>
        </div>

        {extractedPlayers.length === 0 ? (
          <div className="space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            >
              <div className="space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-secondary flex items-center justify-center">
                  <ImageIcon className="w-6 h-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">Click to upload screenshots</p>
                  <p className="text-sm text-muted-foreground">PNG or JPG — select multiple at once</p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{selectedFiles.length} image(s) ready</p>
                <div className="flex flex-wrap gap-2">
                  {selectedFiles.map((file, idx) => (
                    <div key={idx} className="relative group">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={`Preview ${idx + 1}`}
                        className="w-16 h-16 object-cover rounded-lg border"
                      />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                        className="absolute -top-2 -right-2 w-5 h-5 min-h-0 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
            )}

            <Button
              onClick={handleExtract}
              disabled={selectedFiles.length === 0 || isProcessing}
              className="w-full gap-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {processingLabel || "Extracting data..."}
                </>
              ) : (
                <>
                  <ScanLine className="w-4 h-4" />
                  Extract Handicaps ({selectedFiles.length} image{selectedFiles.length !== 1 ? "s" : ""})
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Review the extracted data below. Edit any field if needed, then click "Apply Changes."
            </p>
            {extractedPlayers.map((player, idx) => (
              <div
                key={`player-${idx}`}
                className={`p-3 rounded-lg border transition-colors ${
                  player.selected ? "bg-secondary/30 border-border" : "bg-muted/30 border-border opacity-60"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => togglePlayer(idx)}
                    className={`w-5 h-5 min-h-0 rounded border-2 flex items-center justify-center shrink-0 ${
                      player.selected ? "bg-primary border-primary" : "border-input"
                    }`}
                  >
                    {player.selected && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                  </button>
                  {player.matchedPlayerId ? (
                    <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      Update: {player.matchedPlayerName}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-accent bg-accent/10 border border-accent/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Plus className="w-3 h-3" /> New player
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground">Name</label>
                    <Input
                      value={player.name}
                      onChange={(e) => updatePlayer(idx, "name", e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">H.I.</label>
                    {player.oldHandicapDisplay !== null ? (
                      <div className="flex items-center gap-1 h-8">
                        <span className="text-sm text-muted-foreground line-through">{player.oldHandicapDisplay}</span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                        <Input
                          value={player.handicap_index}
                          onChange={(e) => updatePlayer(idx, "handicap_index", e.target.value)}
                          className="h-8 text-sm flex-1 min-w-0"
                        />
                      </div>
                    ) : (
                      <Input
                        value={player.handicap_index}
                        onChange={(e) => updatePlayer(idx, "handicap_index", e.target.value)}
                        className="h-8 text-sm"
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={resetState}
                disabled={isCommitting}
                className="flex-1 gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Start Over
              </Button>
              <Button
                onClick={handleCommit}
                disabled={isCommitting || selectedCount === 0}
                className="flex-1 gap-2"
              >
                {isCommitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Apply Changes ({selectedCount})
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}